import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState as NativeAppState } from "react-native";

import { uid } from "@/src/data/id";
import { computeFrequentlyUsed } from "@/src/data/frequentlyUsed";
import { normalizeNewItemName } from "@/src/data/itemNames";
import { getLimits, Limits, UpgradeReason } from "@/src/data/limits";
import {
  AppState,
  CarryItem,
  CarryLocation,
  EntitlementTier,
  ItemSource,
  OneTimePlan,
  Routine,
  RoutineSchedule,
  Trigger,
  createDefaultRoutineSchedule,
  normalizeName,
} from "@/src/data/models";
import {
  prepareDueSchedules,
  saveState,
  subscribeToRepositoryStateChanges,
  wipeAllData,
} from "@/src/data/repository";
import { cancel as cancelNotification, scheduleAt } from "@/src/services/notifications";
import {
  deletePendingOneTimePlan,
  evaluateDueOneTimePlans,
  isValidLocalDateKey,
  isValidPrepareTime,
  updatePendingOneTimePlan,
} from "@/src/services/oneTimeScheduling";

// Re-exported for screens that only need the shape, not the repository.
export type { Routine } from "@/src/data/models";

const nowIso = () => new Date().toISOString();

export type AddResult =
  | { status: "ok"; id: string }
  | { status: "duplicate" }
  | { status: "invalid" }
  | { status: "limit"; reason: UpgradeReason };

export type CreateRoutineResult =
  | { status: "ok"; id: string }
  | { status: "limit"; reason: UpgradeReason };

export type ApplyRoutineResult = { addedCount: number; limited: boolean };

export type SaveOneTimePlanResult =
  | { status: "ok"; id: string }
  | { status: "invalid" };

type StoreValue = {
  hydrated: boolean;
  hasLaunched: boolean;
  items: CarryItem[];
  routines: Routine[];
  oneTimePlans: OneTimePlan[];
  frequentlyUsed: string[];
  entitlement: EntitlementTier;
  limits: Limits;
  notificationsEnabled: boolean;
  locations: CarryLocation[];

  completeLaunch: () => void;
  addItem: (name: string, source?: ItemSource) => AddResult;
  // Step 3A: used by the Trigger Setup draft flow so a Quick Add item is
  // only persisted once its reminder is confirmed, with the trigger set in
  // the same write (never a bare item followed by a second update).
  addItemWithTrigger: (name: string, source: ItemSource, trigger: Trigger) => AddResult;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  restoreItem: (item: CarryItem, atIndex: number) => void;
  recordForgotten: (name: string) => AddResult;
  // Step 3A: persists a real (or, on web, intended-only) reminder onto an
  // existing item. Screens must call this rather than mutating items
  // directly — it's the only writer of `item.trigger`.
  setItemTrigger: (itemId: string, trigger: Trigger) => void;
  saveOneTimePlan: (input: {
    name: string;
    scheduledDate: string;
    prepareTime: string | null;
    planId?: string;
    removeItemId?: string;
  }) => SaveOneTimePlanResult;
  deleteOneTimePlan: (planId: string) => void;

  newRoutine: () => CreateRoutineResult;
  deleteRoutine: (routineId: string) => void;
  addRoutineItem: (routineId: string, name: string) => void;
  removeRoutineItem: (routineId: string, itemId: string) => void;
  toggleRoutineItem: (routineId: string, itemId: string) => void;
  renameRoutine: (routineId: string, name: string) => void;
  setRoutineSchedule: (
    routineId: string,
    updates: Partial<Pick<RoutineSchedule, "enabled" | "weekdays" | "prepareTime">>,
  ) => void;
  applyRoutine: (routineId: string) => ApplyRoutineResult;
  getRoutine: (routineId: string) => Routine | undefined;

  setNotificationsEnabled: (enabled: boolean) => void;
  addLocation: (name: string, address: string) => AddResult;
  // Step 3B: persist real GPS coordinates for the Home geofence.
  // Updates the default location's lat/lng in place; the caller is
  // responsible for registering/unregistering the OS geofence separately.
  setHomeLocation: (coords: { latitude: number; longitude: number }) => void;
  clearHomeLocation: () => void;

  // Developer-only. Gated by __DEV__ at the call sites (Settings dev tools);
  // also no-op internally as a second safety net so they can never surface
  // in a production build even if something calls them directly.
  setEntitlementDev: (tier: EntitlementTier) => void;
  setEntitlementFromPurchases: (tier: EntitlementTier) => void;
  resetAllDataDev: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const loadedRef = useRef(false);
  const evaluatingSchedulesRef = useRef(false);
  const stateRef = useRef<AppState | null>(state);
  stateRef.current = state;

  useEffect(() => {
    (async () => {
      const loaded = await prepareDueSchedules();
      setState(loaded);
      loadedRef.current = true;
    })();
  }, []);

  // Re-read persisted state on foreground so background geofence preparation
  // or ENTER cleanup cannot be overwritten by a stale in-memory snapshot.
  useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", (next) => {
      if (
        next !== "active" ||
        !loadedRef.current ||
        evaluatingSchedulesRef.current
      ) {
        return;
      }
      evaluatingSchedulesRef.current = true;
      prepareDueSchedules()
        .then(setState)
        .finally(() => {
          evaluatingSchedulesRef.current = false;
        });
    });
    return () => subscription.remove();
  }, []);

  // When a geofence callback runs in the foreground process, reflect its
  // persisted scheduled-item or ENTER-cleanup result immediately in the UI.
  useEffect(
    () => subscribeToRepositoryStateChanges(setState),
    [],
  );

  useEffect(() => {
    if (!loadedRef.current || !state) return;
    saveState(state);
  }, [state]);

  const completeLaunch = useCallback(() => {
    setState((s) =>
      s ? { ...s, settings: { ...s.settings, onboardingCompleted: true } } : s,
    );
  }, []);

  // Records a usage signal (added and/or forgotten) for the deterministic
  // Frequently Used ranking. Never touches the active item list itself.
  const touchUsage = useCallback(
    (name: string, opts: { added?: boolean; forgotten?: boolean }) => {
      const key = normalizeName(name);
      const ts = nowIso();
      setState((s) => {
        if (!s) return s;
        const existing = s.usageStats[key];
        const next = {
          name: name.trim(),
          addedCount: (existing?.addedCount ?? 0) + (opts.added ? 1 : 0),
          forgottenCount: (existing?.forgottenCount ?? 0) + (opts.forgotten ? 1 : 0),
          lastUsedAt: opts.added ? ts : existing?.lastUsedAt ?? null,
          lastForgottenAt: opts.forgotten ? ts : existing?.lastForgottenAt ?? null,
        };
        return { ...s, usageStats: { ...s.usageStats, [key]: next } };
      });
    },
    [],
  );

  const addItemWithTrigger = useCallback(
    (name: string, source: ItemSource, trigger: Trigger): AddResult => {
      const trimmed = normalizeNewItemName(name);
      if (!trimmed) return { status: "invalid" };
      const s = stateRef.current;
      if (!s) return { status: "duplicate" };

      const key = normalizeName(trimmed);
      // Completed and incomplete copies both count as duplicates for the
      // current departure.
      const exists = s.items.some((it) => normalizeName(it.name) === key);
      if (exists) return { status: "duplicate" };

      const limits = getLimits(s.settings.entitlement);
      // All items (completed + incomplete) count toward the departure limit.
      if (s.items.length >= limits.maxDepartureItems) {
        return { status: "limit", reason: "items" };
      }

      const ts = nowIso();
      const id = uid();
      const newItem: CarryItem = {
        id,
        name: trimmed,
        completed: false,
        createdAt: ts,
        updatedAt: ts,
        trigger,
        source,
      };
      setState((prev) => (prev ? { ...prev, items: [newItem, ...prev.items] } : prev));
      touchUsage(trimmed, { added: true });
      return { status: "ok", id };
    },
    [touchUsage],
  );

  const addItem = useCallback(
    (name: string, source: ItemSource = "quickAdd"): AddResult =>
      addItemWithTrigger(name, source, { type: "leavingHome" }),
    [addItemWithTrigger],
  );

  const toggleItem = useCallback((id: string) => {
    setState((s) =>
      s
        ? {
            ...s,
            items: s.items.map((it) =>
              it.id === id
                ? { ...it, completed: !it.completed, updatedAt: nowIso() }
                : it,
            ),
          }
        : s,
    );
  }, []);

  // Deleting an item with a live "time" reminder must cancel its scheduled
  // OS notification — otherwise it would still fire for an item the user no
  // longer has on their list (an orphan notification).
  const removeItem = useCallback((id: string) => {
    const target = stateRef.current?.items.find((it) => it.id === id);
    if (target?.trigger.type === "time" && target.trigger.config?.notificationId) {
      cancelNotification(target.trigger.config.notificationId).catch(() => {});
    }
    setState((s) => (s ? { ...s, items: s.items.filter((it) => it.id !== id) } : s));
  }, []);

  // Undo (Home's swipe-delete toast): restores the item. If it had a "time"
  // reminder that is STILL in the future, reschedules a fresh OS
  // notification for it (the original was already cancelled on delete) —
  // otherwise the reminder is treated as expired and is not restored, per
  // "avoid orphan notifications".
  const restoreItem = useCallback((item: CarryItem, atIndex: number) => {
    const insert = (finalItem: CarryItem) => {
      setState((s) => {
        if (!s) return s;
        // If the same-named item was re-added while the undo toast was open,
        // don't create a duplicate — the newer one wins.
        const key = normalizeName(finalItem.name);
        if (s.items.some((it) => normalizeName(it.name) === key)) return s;
        const newItems = [...s.items];
        const clampedIndex = Math.min(Math.max(0, atIndex), newItems.length);
        newItems.splice(clampedIndex, 0, finalItem);
        return { ...s, items: newItems };
      });
    };

    const hasFutureTimeReminder =
      item.trigger.type === "time" &&
      !!item.trigger.config?.time &&
      new Date(item.trigger.config.time).getTime() > Date.now();

    if (hasFutureTimeReminder && item.trigger.config?.time) {
      scheduleAt({
        title: "Before you go",
        body: `Don't forget ${item.name}.`,
        date: new Date(item.trigger.config.time),
      })
        .then((notificationId) => {
          insert({
            ...item,
            trigger: { ...item.trigger, config: { ...item.trigger.config, notificationId } },
          });
        })
        .catch(() => {
          // Couldn't reschedule (web preview, permission revoked meanwhile,
          // etc.) — still restore the item, just without a live notification.
          insert({
            ...item,
            trigger: { ...item.trigger, config: { ...item.trigger.config, notificationId: undefined } },
          });
        });
      return;
    }

    // No time reminder, or it already expired — restore as-is, clearing any
    // stale notification id so nothing orphaned lingers on the item.
    insert(
      item.trigger.type === "time"
        ? { ...item, trigger: { ...item.trigger, config: { ...item.trigger.config, notificationId: undefined } } }
        : item,
    );
  }, []);

  // Step 3A: the only writer of `item.trigger`. Cancelling/replacing the OS
  // notification itself is the caller's responsibility (Trigger Setup) —
  // this just persists the resulting trigger metadata.
  const setItemTrigger = useCallback((itemId: string, trigger: Trigger) => {
    setState((s) =>
      s
        ? {
            ...s,
            items: s.items.map((it) =>
              it.id === itemId ? { ...it, trigger, updatedAt: nowIso() } : it,
            ),
          }
        : s,
    );
  }, []);

  // Forgot Something → "Add for next time": ALWAYS persists the forgotten
  // signal (boosts Suggestions ranking) regardless of departure limit.
  // Returns AddResult so the caller can show the correct state (saved-ok
  // vs saved-but-at-limit).
  const recordForgotten = useCallback(
    (name: string): AddResult => {
      const trimmed = normalizeNewItemName(name);
      if (!trimmed) return { status: "invalid" };
      // Always save the forgotten signal — this keeps the item eligible for
      // Suggestions even when the departure is full.
      touchUsage(trimmed, { forgotten: true });
      // addItem handles the `added` signal internally + limit enforcement.
      return addItem(trimmed, "forgotSomething");
    },
    [touchUsage, addItem],
  );

  const newRoutine = useCallback((): CreateRoutineResult => {
    const s = stateRef.current;
    if (!s) return { status: "limit", reason: "routines" };
    const limits = getLimits(s.settings.entitlement);
    const customCount = s.routines.filter((r) => !r.isSeed).length;
    if (customCount >= limits.maxCustomRoutines) {
      return { status: "limit", reason: "routines" };
    }
    const ts = nowIso();
    const id = uid();
    const routine: Routine = {
      id,
      name: "New routine",
      items: [],
      isSeed: false,
      schedule: createDefaultRoutineSchedule(),
      createdAt: ts,
      updatedAt: ts,
    };
    setState((prev) => (prev ? { ...prev, routines: [...prev.routines, routine] } : prev));
    return { status: "ok", id };
  }, []);

  const deleteRoutine = useCallback((routineId: string) => {
    setState((s) =>
      s ? { ...s, routines: s.routines.filter((r) => r.id !== routineId) } : s,
    );
  }, []);

  const addRoutineItem = useCallback((routineId: string, name: string) => {
    const trimmed = normalizeNewItemName(name);
    if (!trimmed) return;
    setState((s) => {
      if (!s) return s;
      const key = normalizeName(trimmed);
      return {
        ...s,
        routines: s.routines.map((r) => {
          if (r.id !== routineId) return r;
          if (r.items.some((i) => normalizeName(i.name) === key)) return r;
          return {
            ...r,
            updatedAt: nowIso(),
            items: [...r.items, { id: uid(), name: trimmed, completed: false }],
          };
        }),
      };
    });
  }, []);

  const removeRoutineItem = useCallback((routineId: string, itemId: string) => {
    setState((s) =>
      s
        ? {
            ...s,
            routines: s.routines.map((r) =>
              r.id === routineId
                ? { ...r, updatedAt: nowIso(), items: r.items.filter((i) => i.id !== itemId) }
                : r,
            ),
          }
        : s,
    );
  }, []);

  const toggleRoutineItem = useCallback((routineId: string, itemId: string) => {
    setState((s) =>
      s
        ? {
            ...s,
            routines: s.routines.map((r) =>
              r.id === routineId
                ? {
                    ...r,
                    items: r.items.map((i) =>
                      i.id === itemId ? { ...i, completed: !i.completed } : i,
                    ),
                  }
                : r,
            ),
          }
        : s,
    );
  }, []);

  const renameRoutine = useCallback((routineId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) =>
      s
        ? {
            ...s,
            routines: s.routines.map((r) =>
              r.id === routineId ? { ...r, name: trimmed, updatedAt: nowIso() } : r,
            ),
          }
        : s,
    );
  }, []);

  const saveOneTimePlan = useCallback(
    (input: {
      name: string;
      scheduledDate: string;
      prepareTime: string | null;
      planId?: string;
      removeItemId?: string;
    }): SaveOneTimePlanResult => {
      const existingName = Boolean(input.planId || input.removeItemId);
      const trimmed = existingName
        ? input.name.trim()
        : normalizeNewItemName(input.name);
      if (
        !trimmed ||
        !isValidLocalDateKey(input.scheduledDate) ||
        !isValidPrepareTime(input.prepareTime)
      ) {
        return { status: "invalid" };
      }
      const current = stateRef.current;
      if (!current) return { status: "invalid" };
      const now = new Date();
      let next = current;
      let id = input.planId;

      if (id) {
        next = updatePendingOneTimePlan(
          next,
          id,
          {
            scheduledDate: input.scheduledDate,
            prepareTime: input.prepareTime,
          },
          now,
        );
        if (next === current) return { status: "invalid" };
      } else {
        id = uid();
        const timestamp = now.toISOString();
        const plan: OneTimePlan = {
          id,
          name: trimmed,
          scheduledDate: input.scheduledDate,
          prepareTime: input.prepareTime,
          status: "pending",
          consumedAt: null,
          expiredAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        next = {
          ...next,
          items: input.removeItemId
            ? next.items.filter((item) => item.id !== input.removeItemId)
            : next.items,
          oneTimePlans: [plan, ...next.oneTimePlans],
        };
      }

      // If the user selects today and the plan is already due, activate it in
      // the same persisted state transition; future plans remain pending.
      next = evaluateDueOneTimePlans(next, now, uid).state;
      stateRef.current = next;
      setState(next);
      return { status: "ok", id };
    },
    [],
  );

  const deleteOneTimePlan = useCallback((planId: string) => {
    setState((current) => {
      if (!current) return current;
      const next = deletePendingOneTimePlan(current, planId);
      stateRef.current = next;
      return next;
    });
  }, []);

  const setRoutineSchedule = useCallback(
    (
      routineId: string,
      updates: Partial<
        Pick<RoutineSchedule, "enabled" | "weekdays" | "prepareTime">
      >,
    ) => {
      setState((s) =>
        s
          ? {
              ...s,
              routines: s.routines.map((routine) =>
                routine.id === routineId
                  ? {
                      ...routine,
                      schedule: { ...routine.schedule, ...updates },
                      updatedAt: nowIso(),
                    }
                  : routine,
              ),
            }
          : s,
      );
    },
    [],
  );

  const applyRoutine = useCallback(
    (routineId: string): ApplyRoutineResult => {
      const s = stateRef.current;
      if (!s) return { addedCount: 0, limited: false };
      const routine = s.routines.find((r) => r.id === routineId);
      if (!routine) return { addedCount: 0, limited: false };

      const limits = getLimits(s.settings.entitlement);
      const existingKeys = new Set(s.items.map((i) => normalizeName(i.name)));
      const ts = nowIso();
      const toAdd: CarryItem[] = [];
      let limited = false;
      let capacity = limits.maxDepartureItems - s.items.length;

      for (const item of routine.items) {
        const key = normalizeName(item.name);
        if (existingKeys.has(key)) continue;
        if (capacity <= 0) {
          limited = true;
          break;
        }
        existingKeys.add(key);
        toAdd.push({
          id: uid(),
          name: item.name,
          completed: false,
          createdAt: ts,
          updatedAt: ts,
          trigger: { type: "leavingHome" },
          source: "routine",
        });
        capacity -= 1;
      }

      if (toAdd.length > 0) {
        setState((prev) => (prev ? { ...prev, items: [...toAdd, ...prev.items] } : prev));
        toAdd.forEach((it) => touchUsage(it.name, { added: true }));
      }
      return { addedCount: toAdd.length, limited };
    },
    [touchUsage],
  );

  const getRoutine = useCallback(
    (routineId: string) => state?.routines.find((r) => r.id === routineId),
    [state],
  );

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setState((s) =>
      s ? { ...s, settings: { ...s.settings, notificationsEnabled: enabled } } : s,
    );
  }, []);

  const addLocation = useCallback((name: string, address: string): AddResult => {
    const s = stateRef.current;
    if (!s) return { status: "duplicate" };
    const limits = getLimits(s.settings.entitlement);
    if (s.settings.locations.length >= limits.maxLocations) {
      return { status: "limit", reason: "locations" };
    }
    const location: CarryLocation = { id: uid(), name, address, isDefault: false };
    setState((prev) =>
      prev
        ? {
            ...prev,
            settings: { ...prev.settings, locations: [...prev.settings.locations, location] },
          }
        : prev,
    );
    return { status: "ok", id: location.id };
  }, []);

  const setHomeLocation = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      setState((s) => {
        if (!s) return s;
        const locs = s.settings.locations;
        if (locs.length === 0) return s;
        // Update the default location (or first location if none marked default).
        const defaultIdx = locs.findIndex((l) => l.isDefault);
        const idx = defaultIdx >= 0 ? defaultIdx : 0;
        const updated = locs.map((loc, i) =>
          i === idx ? { ...loc, latitude: coords.latitude, longitude: coords.longitude } : loc,
        );
        return { ...s, settings: { ...s.settings, locations: updated } };
      });
    },
    [],
  );

  const clearHomeLocation = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      const updated = s.settings.locations.map((loc) =>
        loc.isDefault ? { ...loc, latitude: undefined, longitude: undefined } : loc,
      );
      return { ...s, settings: { ...s.settings, locations: updated } };
    });
  }, []);

  const setEntitlementDev = useCallback((tier: EntitlementTier) => {
    if (!__DEV__) return;
    setState((s) => (s ? { ...s, settings: { ...s.settings, entitlement: tier } } : s));
  }, []);

  // RevenueCat is the production authority for this persisted projection.
  // Updating only the tier preserves every local item, routine, plan, and
  // setting while existing limit checks react immediately.
  const setEntitlementFromPurchases = useCallback((tier: EntitlementTier) => {
    setState((s) => {
      if (!s || s.settings.entitlement === tier) return s;
      const next = { ...s, settings: { ...s.settings, entitlement: tier } };
      stateRef.current = next;
      return next;
    });
  }, []);

  const resetAllDataDev = useCallback(() => {
    if (!__DEV__) return;
    wipeAllData().then(setState);
  }, []);

  const frequentlyUsed = useMemo(
    () => (state ? computeFrequentlyUsed(state.usageStats, 5) : []),
    [state],
  );

  const value = useMemo<StoreValue>(
    () => ({
      hydrated: state !== null,
      hasLaunched: state?.settings.onboardingCompleted ?? false,
      items: state?.items ?? [],
      routines: state?.routines ?? [],
      oneTimePlans: state?.oneTimePlans ?? [],
      frequentlyUsed,
      entitlement: state?.settings.entitlement ?? "FREE",
      limits: getLimits(state?.settings.entitlement ?? "FREE"),
      notificationsEnabled: state?.settings.notificationsEnabled ?? false,
      locations: state?.settings.locations ?? [],
      completeLaunch,
      addItem,
      addItemWithTrigger,
      toggleItem,
      removeItem,
      restoreItem,
      recordForgotten,
      setItemTrigger,
      saveOneTimePlan,
      deleteOneTimePlan,
      newRoutine,
      deleteRoutine,
      addRoutineItem,
      removeRoutineItem,
      toggleRoutineItem,
      renameRoutine,
      setRoutineSchedule,
      applyRoutine,
      getRoutine,
      setNotificationsEnabled,
      addLocation,
      setHomeLocation,
      clearHomeLocation,
      setEntitlementDev,
      setEntitlementFromPurchases,
      resetAllDataDev,
    }),
    [
      state,
      frequentlyUsed,
      completeLaunch,
      addItem,
      addItemWithTrigger,
      toggleItem,
      removeItem,
      restoreItem,
      recordForgotten,
      setItemTrigger,
      saveOneTimePlan,
      deleteOneTimePlan,
      newRoutine,
      deleteRoutine,
      addRoutineItem,
      removeRoutineItem,
      toggleRoutineItem,
      renameRoutine,
      setRoutineSchedule,
      applyRoutine,
      getRoutine,
      setNotificationsEnabled,
      addLocation,
      setHomeLocation,
      clearHomeLocation,
      setEntitlementDev,
      setEntitlementFromPurchases,
      resetAllDataDev,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
