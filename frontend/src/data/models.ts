// CarryCue Step 2 — typed local data models.
// This is the single source of truth for the shape of data persisted on the
// device. Bump SCHEMA_VERSION and extend `repository.ts`'s migration logic
// whenever this shape changes.

export const SCHEMA_VERSION = 5;

// ---------------------------------------------------------------------------
// Trigger — when a Carry item should remind the user.
// Step 3A: `time` is wired to a REAL scheduled local notification (see
// src/services/notifications.ts). `leavingHome` / `arrivingPlace` remain
// mock/config-only — real geofencing lands in Step 3B.
// ---------------------------------------------------------------------------
export type TriggerType = "leavingHome" | "time" | "arrivingPlace";

export type Trigger = {
  type: TriggerType;
  config?: {
    // ISO 8601 instant the "time" trigger is/was scheduled for.
    time?: string;
    // Mock/config-only — not wired to real geofencing yet (Step 3B).
    placeName?: string;
    // Identifier returned by expo-notifications for the currently scheduled
    // OS notification backing a "time" trigger. Undefined means either no
    // trigger, or a "time" trigger that couldn't get a live OS notification
    // (e.g. web preview, or permission unavailable) — the intended time is
    // still remembered so it can be rescheduled later.
    notificationId?: string;
  };
};

// Where a Carry item came from — powers analytics-free heuristics like
// Frequently Used, without needing AI.
export type ItemSource =
  | "quickAdd"
  | "routine"
  | "oneTimePlan"
  | "frequentlyUsed"
  | "forgotSomething";

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

// Local recurring preparation schedule. Weekdays use JavaScript's getDay()
// convention: 0 = Sunday through 6 = Saturday.
export type RoutineSchedule = {
  enabled: boolean;
  weekdays: number[];
  prepareTime: string; // local 24-hour "HH:mm"
  // Explicit idempotency marker, for example "<routineId>:2026-09-01".
  lastPreparedOccurrenceKey: string | null;
};

export const createDefaultRoutineSchedule = (): RoutineSchedule => ({
  enabled: false,
  weekdays: [1, 2, 3, 4, 5],
  prepareTime: "07:30",
  lastPreparedOccurrenceKey: null,
});

export type Routine = {
  id: string;
  name: string;
  items: RoutineItem[];
  // True for the three examples seeded on first install (Everyday / School /
  // Gym). Deleting a seeded routine does not bring it back on next launch,
  // and seeded routines never count against the Free "custom routine" limit.
  isSeed: boolean;
  schedule: RoutineSchedule;
  createdAt: string;
  updatedAt: string;
};

// A device-local, non-recurring preparation plan. It stays outside `items`
// until its selected local date/time is due, so pending plans do not consume
// an active departure slot.
export type OneTimePlanStatus = "pending" | "consumed" | "expired";

export type OneTimePlan = {
  id: string;
  name: string;
  scheduledDate: string; // local calendar date, "YYYY-MM-DD"
  prepareTime: string | null; // optional local 24-hour "HH:mm"; null = start of day
  status: OneTimePlanStatus;
  consumedAt: string | null;
  expiredAt: string | null;
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
  // Step 3B: real GPS coordinates used for geofencing.
  // undefined = not yet set by the user (no geofence registered).
  latitude?: number;
  longitude?: number;
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
  oneTimePlans: OneTimePlan[];
  usageStats: UsageStats;
  departure: {
    status: "home" | "departed";
    departedAt: string | null;
  };
  settings: AppSettings;
};

// Normalize an item/routine name for duplicate checks and usage-stat keys:
// trim whitespace + case-insensitive comparison.
export const normalizeName = (name: string): string => name.trim().toLowerCase();
