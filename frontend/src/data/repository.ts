// Local persistence repository — the ONLY module that talks to storage
// directly. Screens/store must go through loadState()/saveState() instead
// of reading AsyncStorage themselves.

import { storage } from "@/src/utils/storage";

import { uid } from "@/src/data/id";
import {
  AppState,
  CarryItem,
  ItemSource,
  OneTimePlan,
  Routine,
  RoutineItem,
  RoutineSchedule,
  SCHEMA_VERSION,
  UsageStats,
  createDefaultRoutineSchedule,
  normalizeName,
} from "@/src/data/models";
import {
  evaluateDueOneTimePlans,
  isValidLocalDateKey,
  isValidPrepareTime,
} from "@/src/services/oneTimeScheduling";
import {
  DepartureLifecycleEvent,
  DepartureLifecycleResult,
  applyDepartureLifecycleEvent,
  evaluateDueScheduledRoutines,
} from "@/src/services/routineScheduling";

const STORAGE_KEY = "carrycue_store_v2";
// Step 1's persistence key — read once for a best-effort migration, never
// written back to.
const LEGACY_KEY_V1 = "carrycue_state_v1";

const nowIso = () => new Date().toISOString();
const stateChangeListeners = new Set<(state: AppState) => void>();

export function subscribeToRepositoryStateChanges(
  listener: (state: AppState) => void,
): () => void {
  stateChangeListeners.add(listener);
  return () => stateChangeListeners.delete(listener);
}

function notifyRepositoryStateChange(state: AppState): void {
  stateChangeListeners.forEach((listener) => listener(state));
}

function mkItem(name: string, source: ItemSource = "quickAdd"): CarryItem {
  const ts = nowIso();
  return {
    id: uid(),
    name,
    completed: false,
    createdAt: ts,
    updatedAt: ts,
    trigger: { type: "leavingHome" },
    source,
  };
}

function mkRoutineItem(name: string): RoutineItem {
  return { id: uid(), name, completed: false };
}

function mkSeedRoutine(name: string, itemNames: string[]): Routine {
  const ts = nowIso();
  return {
    id: uid(),
    name,
    items: itemNames.map(mkRoutineItem),
    isSeed: true,
    schedule: createDefaultRoutineSchedule(),
    createdAt: ts,
    updatedAt: ts,
  };
}

// First-install data only. Never called again once anything is persisted,
// so deleting a seeded routine/item does not bring it back on restart.
export function buildInitialState(): AppState {
  const ts = nowIso();
  const items = ["Wallet", "Student ID", "Charger", "Umbrella"].map((n) => mkItem(n));

  const routines: Routine[] = [
    mkSeedRoutine("Everyday", ["Wallet", "Keys", "Earbuds"]),
    mkSeedRoutine("School", ["Student ID", "Laptop", "Charger"]),
    mkSeedRoutine("Gym", ["Shoes", "Towel", "Bottle"]),
  ];

  // Seed a believable initial ranking so Frequently Used isn't empty on
  // first launch — counts are illustrative, not scores shown to the user.
  const usageSeed: Array<[string, number]> = [
    ["Wallet", 4],
    ["Keys", 3],
    ["Charger", 2],
    ["Umbrella", 1],
    ["Student ID", 1],
  ];
  const usageStats: UsageStats = {};
  usageSeed.forEach(([name, count]) => {
    usageStats[normalizeName(name)] = {
      name,
      addedCount: count,
      forgottenCount: 0,
      lastUsedAt: ts,
      lastForgottenAt: null,
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    items,
    routines,
    oneTimePlans: [],
    usageStats,
    departure: {
      status: "home",
      departedAt: null,
    },
    settings: {
      onboardingCompleted: false,
      leaveTime: "8:30",
      notificationsEnabled: false,
      entitlement: "FREE",
      locations: [{ id: uid(), name: "Home", address: "Shibuya, Tokyo", isDefault: true }],
    },
  };
}

// Collapse items/routine-items that share a normalized name, keeping the
// first occurrence — heals state written before duplicate prevention
// existed, and is re-run on every load as a cheap safety net.
function dedupeByName<T extends { name: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of list) {
    const key = normalizeName(it.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Fills in any fields missing from an older/partial persisted payload with
// defaults, so adding a new field later doesn't crash existing installs.
function normalizeRoutineSchedule(
  schedule: Partial<RoutineSchedule> | undefined,
): RoutineSchedule {
  const defaults = createDefaultRoutineSchedule();
  const weekdays = Array.isArray(schedule?.weekdays)
    ? [...new Set(schedule.weekdays)].filter(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      )
    : defaults.weekdays;
  return {
    enabled: schedule?.enabled === true,
    weekdays,
    prepareTime:
      typeof schedule?.prepareTime === "string" &&
      /^\d{2}:\d{2}$/.test(schedule.prepareTime)
        ? schedule.prepareTime
        : defaults.prepareTime,
    lastPreparedOccurrenceKey:
      typeof schedule?.lastPreparedOccurrenceKey === "string"
        ? schedule.lastPreparedOccurrenceKey
        : null,
  };
}

// Older releases exposed an "arrivingPlace" trigger that was never backed by
// an arrival geofence. Keep the CarryItem itself intact and safely fall it
// back to the supported departure trigger when legacy state is loaded.
function normalizeItemTrigger(item: CarryItem): CarryItem {
  const persistedType = (
    item.trigger as { type?: string } | null | undefined
  )?.type;
  if (persistedType === "leavingHome" || persistedType === "time") {
    return item;
  }
  return {
    ...item,
    trigger: {
      type: "leavingHome",
      ...(item.trigger?.config ? { config: item.trigger.config } : {}),
    },
  };
}

function normalizeOneTimePlan(plan: Partial<OneTimePlan>): OneTimePlan | null {
  const prepareTime = plan.prepareTime ?? null;
  if (
    typeof plan.id !== "string" ||
    typeof plan.name !== "string" ||
    !plan.name.trim() ||
    !isValidLocalDateKey(plan.scheduledDate ?? "") ||
    !isValidPrepareTime(prepareTime)
  ) {
    return null;
  }
  const createdAt =
    typeof plan.createdAt === "string" ? plan.createdAt : nowIso();
  const status =
    plan.status === "consumed" || plan.status === "expired"
      ? plan.status
      : "pending";
  return {
    id: plan.id,
    name: plan.name.trim(),
    scheduledDate: plan.scheduledDate as string,
    prepareTime,
    status,
    consumedAt:
      status === "consumed" && typeof plan.consumedAt === "string"
        ? plan.consumedAt
        : null,
    expiredAt:
      status === "expired" && typeof plan.expiredAt === "string"
        ? plan.expiredAt
        : null,
    createdAt,
    updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : createdAt,
  };
}

export function normalizePersistedState(state: Partial<AppState>): AppState {
  const fresh = buildInitialState();
  return {
    schemaVersion: SCHEMA_VERSION,
    items: dedupeByName(state.items ?? []).map(normalizeItemTrigger),
    routines: (state.routines ?? []).map((r) => ({
      ...r,
      isSeed: r.isSeed ?? false,
      items: dedupeByName(r.items ?? []),
      schedule: normalizeRoutineSchedule(
        (r as Routine & { schedule?: RoutineSchedule }).schedule,
      ),
    })),
    oneTimePlans: (state.oneTimePlans ?? [])
      .map((plan) => normalizeOneTimePlan(plan))
      .filter((plan): plan is OneTimePlan => plan !== null),
    usageStats: state.usageStats ?? {},
    departure: {
      status: state.departure?.status === "departed" ? "departed" : "home",
      departedAt:
        state.departure?.status === "departed" &&
        typeof state.departure.departedAt === "string"
          ? state.departure.departedAt
          : null,
    },
    settings: { ...fresh.settings, ...(state.settings ?? {}) },
  };
}

// Best-effort one-time migration from Step 1's in-memory-shaped storage.
// Returns null if there's nothing to migrate (fresh install).
async function migrateFromV1(): Promise<AppState | null> {
  const raw = await storage.getItem<string | null>(LEGACY_KEY_V1, null);
  if (!raw) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const old: any = JSON.parse(raw);
    const ts = nowIso();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: CarryItem[] = (old.items ?? []).map((i: any) => ({
      id: i.id ?? uid(),
      name: i.name,
      completed: !!i.done,
      createdAt: ts,
      updatedAt: ts,
      trigger: { type: "leavingHome" },
      source: "quickAdd" as ItemSource,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routines: Routine[] = (old.routines ?? []).map((r: any) => ({
      id: r.id ?? uid(),
      name: r.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (r.items ?? []).map((it: any) => ({
        id: it.id ?? uid(),
        name: it.name,
        completed: !!it.done,
      })),
      isSeed: true,
      schedule: createDefaultRoutineSchedule(),
      createdAt: ts,
      updatedAt: ts,
    }));

    const usageStats: UsageStats = {};
    const legacyFrequent: string[] = old.frequentlyUsed ?? [];
    legacyFrequent.forEach((name, idx) => {
      usageStats[normalizeName(name)] = {
        name,
        addedCount: legacyFrequent.length - idx,
        forgottenCount: 0,
        lastUsedAt: ts,
        lastForgottenAt: null,
      };
    });

    return normalizePersistedState({
      schemaVersion: SCHEMA_VERSION,
      items,
      routines,
      oneTimePlans: [],
      usageStats,
      departure: {
        status: "home",
        departedAt: null,
      },
      settings: {
        onboardingCompleted: !!old.hasLaunched,
        leaveTime: old.leaveTime ?? "8:30",
        notificationsEnabled: false,
        entitlement: "FREE",
        locations: [{ id: uid(), name: "Home", address: "Shibuya, Tokyo", isDefault: true }],
      },
    });
  } catch {
    return null;
  }
}

export async function saveState(state: AppState): Promise<void> {
  await storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadState(): Promise<AppState> {
  const raw = await storage.getItem<string | null>(STORAGE_KEY, null);
  if (raw) {
    try {
      return normalizePersistedState(JSON.parse(raw) as Partial<AppState>);
    } catch {
      // Corrupt payload — fall through to migration/fresh-install below.
    }
  }

  const migrated = await migrateFromV1();
  if (migrated) {
    await saveState(migrated);
    return migrated;
  }

  const fresh = buildInitialState();
  await saveState(fresh);
  return fresh;
}

// Developer-only: wipe local CarryCue data back to a fresh first-install
// state. Gated at the call site (Settings dev tools, __DEV__ only).
export async function wipeAllData(): Promise<AppState> {
  const fresh = buildInitialState();
  await saveState(fresh);
  return fresh;
}

export async function prepareDueSchedules(
  now: Date = new Date(),
): Promise<AppState> {
  const current = await loadState();
  // Required deterministic ordering: recurring Routines get first access to
  // active-item capacity, then one-time plans, then callers rank the reminder.
  const routineResult = evaluateDueScheduledRoutines(current, now, uid);
  const oneTimeResult = evaluateDueOneTimePlans(routineResult.state, now, uid);
  if (oneTimeResult.state !== current) {
    await saveState(oneTimeResult.state);
    notifyRepositoryStateChange(oneTimeResult.state);
  }
  return oneTimeResult.state;
}

// Kept as a compatibility export for existing callers outside this step.
export const prepareDueScheduledRoutines = prepareDueSchedules;

export async function persistDepartureLifecycleEvent(
  event: DepartureLifecycleEvent,
  now: Date = new Date(),
): Promise<DepartureLifecycleResult> {
  const current = await loadState();
  const result = applyDepartureLifecycleEvent(current, event, now);
  if (result.state !== current) {
    await saveState(result.state);
    notifyRepositoryStateChange(result.state);
  }
  return result;
}

// Background-task-safe state reader.
//
// Called from the geofencing background task where React context and the
// Zustand/Context store are unavailable. Returns the active "leavingHome"
// items plus usage history needed for deterministic forgotten-item ranking,
// while keeping schema parsing/migration responsibility inside this module.
//
// Returns null when the stored state is absent or cannot be parsed.
export async function loadStateForBackgroundTask(): Promise<{
  activeItems: CarryItem[];
  usageStats: UsageStats;
} | null> {
  try {
    // storage.setItem JSON.stringifies its value, so the raw bytes in
    // AsyncStorage are JSON.stringify(JSON.stringify(state)).  storage.getItem
    // unwraps the outer layer; we still need one JSON.parse to get the object.
    const rawJson = await storage.getItem<string | null>(STORAGE_KEY, null);
    if (!rawJson) return null;
    const state = normalizePersistedState(
      JSON.parse(rawJson) as Partial<AppState>,
    );
    const activeItems = (state.items ?? []).filter(
      (item) =>
        !item.completed && item.trigger?.type === "leavingHome",
    );
    return { activeItems, usageStats: state.usageStats ?? {} };
  } catch {
    return null;
  }
}
