import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { uid } from "@/src/data/id";
import { computeFrequentlyUsed } from "@/src/data/frequentlyUsed";
import { getLimits, Limits, UpgradeReason } from "@/src/data/limits";
import {
  AppState,
  CarryItem,
  CarryLocation,
  EntitlementTier,
  ItemSource,
  Routine,
  normalizeName,
} from "@/src/data/models";
import { loadState, saveState, wipeAllData } from "@/src/data/repository";

// Re-exported for screens that only need the shape, not the repository.
export type { Routine } from "@/src/data/models";

const nowIso = () => new Date().toISOString();

export type AddResult =
  | { status: "ok" }
  | { status: "duplicate" }
  | { status: "limit"; reason: UpgradeReason };

export type CreateRoutineResult =
  | { status: "ok"; id: string }
  | { status: "limit"; reason: UpgradeReason };

export type ApplyRoutineResult = { addedCount: number; limited: boolean };

type StoreValue = {
  hydrated: boolean;
  hasLaunched: boolean;
  leaveTime: string;
  items: CarryItem[];
  routines: Routine[];
  frequentlyUsed: string[];
  entitlement: EntitlementTier;
  limits: Limits;
  notificationsEnabled: boolean;
  locations: CarryLocation[];

  completeLaunch: () => void;
  addItem: (name: string, source?: ItemSource) => AddResult;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  recordForgotten: (name: string) => void;

  newRoutine: () => CreateRoutineResult;
  deleteRoutine: (routineId: string) => void;
  addRoutineItem: (routineId: string, name: string) => void;
  removeRoutineItem: (routineId: string, itemId: string) => void;
  toggleRoutineItem: (routineId: string, itemId: string) => void;
  renameRoutine: (routineId: string, name: string) => void;
  applyRoutine: (routineId: string) => ApplyRoutineResult;
  getRoutine: (routineId: string) => Routine | undefined;

  setNotificationsEnabled: (enabled: boolean) => void;
  addLocation: (name: string, address: string) => AddResult;

  // Developer-only. Gated by __DEV__ at the call sites (Settings dev tools);
  // also no-op internally as a second safety net so they can never surface
  // in a production build even if something calls them directly.
  setEntitlementDev: (tier: EntitlementTier) => void;
  resetAllDataDev: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const loadedRef = useRef(false);
  const stateRef = useRef<AppState | null>(state);
  stateRef.current = state;

  useEffect(() => {
    (async () => {
      const loaded = await loadState();
      setState(loaded);
      loadedRef.current = true;
    })();
  }, []);

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

  const addItem = useCallback(
    (name: string, source: ItemSource = "quickAdd"): AddResult => {
      const trimmed = name.trim();
      if (!trimmed) return { status: "duplicate" };
      const s = stateRef.current;
      if (!s) return { status: "duplicate" };

      const key = normalizeName(trimmed);
      // Completed and incomplete copies both count as duplicates for the
      // current departure.
      const exists = s.items.some((it) => normalizeName(it.name) === key);
      if (exists) return { status: "duplicate" };

      const limits = getLimits(s.settings.entitlement);
      if (s.items.length >= limits.maxActiveItems) {
        return { status: "limit", reason: "items" };
      }

      const ts = nowIso();
      const newItem: CarryItem = {
        id: uid(),
        name: trimmed,
        completed: false,
        createdAt: ts,
        updatedAt: ts,
        trigger: { type: "leavingHome" },
        source,
      };
      setState((prev) => (prev ? { ...prev, items: [newItem, ...prev.items] } : prev));
      touchUsage(trimmed, { added: true });
      return { status: "ok" };
    },
    [touchUsage],
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

  const removeItem = useCallback((id: string) => {
    setState((s) => (s ? { ...s, items: s.items.filter((it) => it.id !== id) } : s));
  }, []);

  // Forgot Something → "Add for next time": persists forgotten history
  // (which also boosts Frequently Used) and adds the item to the active
  // departure if there's room and it isn't already present.
  const recordForgotten = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      touchUsage(trimmed, { added: true, forgotten: true });
      addItem(trimmed, "forgotSomething");
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
    const trimmed = name.trim();
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
      let capacity = limits.maxActiveItems - s.items.length;

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
    return { status: "ok" };
  }, []);

  const setEntitlementDev = useCallback((tier: EntitlementTier) => {
    if (!__DEV__) return;
    setState((s) => (s ? { ...s, settings: { ...s.settings, entitlement: tier } } : s));
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
      leaveTime: state?.settings.leaveTime ?? "8:30",
      items: state?.items ?? [],
      routines: state?.routines ?? [],
      frequentlyUsed,
      entitlement: state?.settings.entitlement ?? "FREE",
      limits: getLimits(state?.settings.entitlement ?? "FREE"),
      notificationsEnabled: state?.settings.notificationsEnabled ?? false,
      locations: state?.settings.locations ?? [],
      completeLaunch,
      addItem,
      toggleItem,
      removeItem,
      recordForgotten,
      newRoutine,
      deleteRoutine,
      addRoutineItem,
      removeRoutineItem,
      toggleRoutineItem,
      renameRoutine,
      applyRoutine,
      getRoutine,
      setNotificationsEnabled,
      addLocation,
      setEntitlementDev,
      resetAllDataDev,
    }),
    [
      state,
      frequentlyUsed,
      completeLaunch,
      addItem,
      toggleItem,
      removeItem,
      recordForgotten,
      newRoutine,
      deleteRoutine,
      addRoutineItem,
      removeRoutineItem,
      toggleRoutineItem,
      renameRoutine,
      applyRoutine,
      getRoutine,
      setNotificationsEnabled,
      addLocation,
      setEntitlementDev,
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
