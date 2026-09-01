// Local persistence repository — the ONLY module that talks to storage
// directly. Screens/store must go through loadState()/saveState() instead
// of reading AsyncStorage themselves.

import { storage } from "@/src/utils/storage";

import { uid } from "@/src/data/id";
import {
  AppState,
  CarryItem,
  ItemSource,
  Routine,
  RoutineItem,
  SCHEMA_VERSION,
  UsageStats,
  normalizeName,
} from "@/src/data/models";

const STORAGE_KEY = "carrycue_store_v2";
// Step 1's persistence key — read once for a best-effort migration, never
// written back to.
const LEGACY_KEY_V1 = "carrycue_state_v1";

const nowIso = () => new Date().toISOString();

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
    usageStats,
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
function normalizeLoaded(state: Partial<AppState>): AppState {
  const fresh = buildInitialState();
  return {
    schemaVersion: SCHEMA_VERSION,
    items: dedupeByName(state.items ?? []),
    routines: (state.routines ?? []).map((r) => ({
      ...r,
      isSeed: r.isSeed ?? false,
      items: dedupeByName(r.items ?? []),
    })),
    usageStats: state.usageStats ?? {},
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

    return normalizeLoaded({
      schemaVersion: SCHEMA_VERSION,
      items,
      routines,
      usageStats,
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
      return normalizeLoaded(JSON.parse(raw) as Partial<AppState>);
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
    const state = JSON.parse(rawJson) as Partial<AppState>;
    const activeItems = (state.items ?? []).filter(
      (item) =>
        !item.completed && item.trigger?.type === "leavingHome",
    );
    return { activeItems, usageStats: state.usageStats ?? {} };
  } catch {
    return null;
  }
}
