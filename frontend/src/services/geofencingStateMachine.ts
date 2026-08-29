// CarryCue — Step 3B: Geofencing departure-cycle state machine.
//
// This module is intentionally free of React Native and Expo imports so it
// can be unit-tested in a plain Node environment.  `geofencing.ts` uses it
// for all state logic; platform APIs (Location, TaskManager, Notifications)
// live only in that wrapper.
//
// Design
// ──────
// Registration sets armed = true immediately because the caller ("Use current
// location") already knows the device is at Home.  No initialPending flag is
// needed — that removed a class of Android bugs where the flag lingered and
// swallowed the very first real EXIT event when the OS never fired an initial
// state callback.
//
// iOS initial-state safety: a 10-second grace window after registration lets
// processExitEvent absorb any spurious iOS initial-EXIT callback WITHOUT
// disarming the cycle.  After the window the cycle is unaffected.
//
// Armed / disarmed cycle
// ──────────────────────
//  initializeRegistration()    →  armed = true, registeredAt = now
//  processEnterEvent()          →  armed = true (re-arm after return home)
//  processExitEvent() [armed]   →  depends:
//    • within grace window      →  stay armed, no notify (iOS initial state)
//    • within defensive cooldown→  disarm, no notify (GPS jitter duplicate)
//    • otherwise                →  disarm + notify (real departure)
//  processExitEvent() [disarmed]→  ignore (duplicate)

// ── Storage interface ─────────────────────────────────────────────────────────

export interface GeoStorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// ── Keys ──────────────────────────────────────────────────────────────────────

export const GEO_ARMED_KEY = "carrycue_geo_armed";
export const GEO_REGISTERED_AT_KEY = "carrycue_geo_registered_at";
export const GEO_LAST_EXIT_TS_KEY = "carrycue_geo_last_exit_ts";
export const GEO_LAST_EVENT_KEY = "carrycue_geo_last_event";
export const GEO_LAST_NOTIF_KEY = "carrycue_geo_last_notif";

// ── Timings ───────────────────────────────────────────────────────────────────

// Time after registration during which an EXIT is absorbed as a possible iOS
// initial-state callback.  The cycle stays ARMED — the user is still at home.
export const REGISTRATION_GRACE_MS = 10_000; // 10 seconds

// Secondary duplicate-event protection.
export const DEFENSIVE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ── Event log type (shared with geofencing.ts) ────────────────────────────────

export type GeoEventLog = {
  eventType: "enter" | "exit";
  timestamp: string;
  notificationSent: boolean;
  itemCount?: number;
  note?: string;
  simulated?: boolean;
};

// ── Process ENTER ─────────────────────────────────────────────────────────────

export async function processEnterEvent(
  storage: GeoStorageInterface,
  now: number = Date.now(),
): Promise<void> {
  // Re-arm.  If this is an iOS initial ENTER just after registration, the cycle
  // was already armed; this write is idempotent and harmless.
  await storage.setItem(GEO_ARMED_KEY, "true");
  await storage.setItem(
    GEO_LAST_EVENT_KEY,
    JSON.stringify({
      eventType: "enter",
      timestamp: new Date(now).toISOString(),
      notificationSent: false,
    } satisfies GeoEventLog),
  );
}

// ── Process EXIT ──────────────────────────────────────────────────────────────

export type ExitResult =
  | { shouldNotify: true }
  | { shouldNotify: false; reason: "disarmed" | "grace-window" | "cooldown" | "no-items" };

export async function processExitEvent(
  storage: GeoStorageInterface,
  activeItems: { name: string }[],
  now: number = Date.now(),
): Promise<ExitResult> {
  const armedRaw = await storage.getItem(GEO_ARMED_KEY);
  const armed = armedRaw === "true";

  // ── Duplicate EXIT while disarmed ─────────────────────────────────────────
  if (!armed) {
    await storage.setItem(
      GEO_LAST_EVENT_KEY,
      JSON.stringify({
        eventType: "exit",
        timestamp: new Date(now).toISOString(),
        notificationSent: false,
        note: "skipped-disarmed",
      } satisfies GeoEventLog),
    );
    return { shouldNotify: false, reason: "disarmed" };
  }

  // ── Grace window: iOS initial-state EXIT protection ───────────────────────
  // When registerHomeGeofence() is called the user IS at home.  iOS may fire
  // one immediate state-determination EXIT due to GPS imprecision.  Absorbing
  // it in a short window prevents a false "you left home" notification, while
  // keeping the cycle ARMED so the next real EXIT works correctly.
  // On Android this window simply expires without being triggered.
  const regRaw = await storage.getItem(GEO_REGISTERED_AT_KEY);
  if (regRaw !== null) {
    const regAt = parseInt(regRaw, 10);
    if (!isNaN(regAt) && now - regAt < REGISTRATION_GRACE_MS) {
      // Stay armed — do NOT disarm for a possible initial-state callback.
      await storage.setItem(
        GEO_LAST_EVENT_KEY,
        JSON.stringify({
          eventType: "exit",
          timestamp: new Date(now).toISOString(),
          notificationSent: false,
          note: "skipped-grace-window",
        } satisfies GeoEventLog),
      );
      return { shouldNotify: false, reason: "grace-window" };
    }
  }

  // ── Defensive cooldown ────────────────────────────────────────────────────
  const lastExitRaw = await storage.getItem(GEO_LAST_EXIT_TS_KEY);
  if (lastExitRaw !== null) {
    const lastExit = parseInt(lastExitRaw, 10);
    if (!isNaN(lastExit) && now - lastExit < DEFENSIVE_COOLDOWN_MS) {
      await storage.setItem(GEO_ARMED_KEY, "false");
      await storage.setItem(
        GEO_LAST_EVENT_KEY,
        JSON.stringify({
          eventType: "exit",
          timestamp: new Date(now).toISOString(),
          notificationSent: false,
          note: "skipped-defensive-cooldown",
        } satisfies GeoEventLog),
      );
      return { shouldNotify: false, reason: "cooldown" };
    }
  }

  // ── Valid departure ───────────────────────────────────────────────────────
  // Disarm before any further await so duplicate events arriving concurrently
  // are rejected by the armed-check above.
  await storage.setItem(GEO_ARMED_KEY, "false");
  await storage.setItem(GEO_LAST_EXIT_TS_KEY, String(now));

  await storage.setItem(
    GEO_LAST_EVENT_KEY,
    JSON.stringify({
      eventType: "exit",
      timestamp: new Date(now).toISOString(),
      notificationSent: activeItems.length > 0,
      itemCount: activeItems.length,
    } satisfies GeoEventLog),
  );

  if (activeItems.length === 0) {
    return { shouldNotify: false, reason: "no-items" };
  }

  return { shouldNotify: true };
}

// ── Initialize on registration ────────────────────────────────────────────────

// Called by registerHomeGeofence() after startGeofencingAsync.
// Sets armed = true and records the registration timestamp for the grace window.
export async function initializeRegistration(
  storage: GeoStorageInterface,
  now: number = Date.now(),
): Promise<void> {
  await storage.setItem(GEO_ARMED_KEY, "true");
  await storage.setItem(GEO_REGISTERED_AT_KEY, String(now));
}

// Called by unregisterHomeGeofence() — clears all transient state.
export async function clearRegistrationState(
  storage: GeoStorageInterface,
): Promise<void> {
  await storage.setItem(GEO_ARMED_KEY, "false");
  await storage.removeItem(GEO_REGISTERED_AT_KEY);
}
