// CarryCue Step 2 — typed local data models.
// This is the single source of truth for the shape of data persisted on the
// device. Bump SCHEMA_VERSION and extend `repository.ts`'s migration logic
// whenever this shape changes.

export const SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Trigger — when a Carry item should remind the user. For Step 2 only
// `leavingHome` is actually wired to behavior; `time` / `arrivingPlace`
// carry mock/config data set from the (already existing) Trigger Setup
// screen and are not yet backed by real notifications or geofencing.
// ---------------------------------------------------------------------------
export type TriggerType = "leavingHome" | "tomorrowMorning" | "time" | "arrivingPlace";

export type Trigger = {
  type: TriggerType;
  // Mock/config-only extra data — not wired to real scheduling/geofencing yet.
  config?: {
    time?: string;
    placeName?: string;
  };
};

// Where a Carry item came from — powers analytics-free heuristics like
// Frequently Used, without needing AI.
export type ItemSource = "quickAdd" | "routine" | "frequentlyUsed" | "forgotSomething";

export type CarryItem = {
  id: string;
  name: string;
  completed: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  trigger: Trigger;
  source: ItemSource;
};

export type RoutineItem = {
  id: string;
  name: string;
  completed: boolean;
};

export type Routine = {
  id: string;
  name: string;
  items: RoutineItem[];
  // True for the three examples seeded on first install (Everyday / School /
  // Gym). Deleting a seeded routine does not bring it back on next launch,
  // and seeded routines never count against the Free "custom routine" limit.
  isSeed: boolean;
  createdAt: string;
  updatedAt: string;
};

// One record per normalized item name. Powers the deterministic Frequently
// Used ranking — no AI involved.
export type UsageStat = {
  name: string; // display name (most recent casing used)
  addedCount: number;
  forgottenCount: number;
  lastUsedAt: string | null;
  lastForgottenAt: string | null;
};

export type UsageStats = Record<string, UsageStat>; // key = normalizeName(name)

export type EntitlementTier = "FREE" | "PRO";

export type CarryLocation = {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
};

export type AppSettings = {
  onboardingCompleted: boolean;
  leaveTime: string;
  // Mock preference — no real push permission/scheduling wired yet.
  notificationsEnabled: boolean;
  entitlement: EntitlementTier;
  locations: CarryLocation[];
};

export type AppState = {
  schemaVersion: number;
  items: CarryItem[];
  routines: Routine[];
  usageStats: UsageStats;
  settings: AppSettings;
};

// Normalize an item/routine name for duplicate checks and usage-stat keys:
// trim whitespace + case-insensitive comparison.
export const normalizeName = (name: string): string => name.trim().toLowerCase();
