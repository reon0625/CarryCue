// CarryCue — Step 3B: Real Geofencing Service.
//
// Architecture
// ───────────
// One 150-metre Home geofence (EXIT-only for notifications, ENTER for re-arm).
// State is persisted to AsyncStorage so it survives app termination.
// The departure-cycle state machine lives in geofencingStateMachine.ts (pure
// TypeScript, no RN dependencies, fully unit-tested).
//
// Armed / disarmed departure cycle
// ─────────────────────────────────
//  registerHomeGeofence()  →  armed = true, registeredAt = now
//  ENTER (re-arm)          →  armed = true   (no notification)
//  EXIT — grace window     →  stay armed, no notification (iOS initial state)
//  EXIT — armed, expired   →  notify + disarm
//  EXIT — disarmed         →  duplicate/ignored
//
// Initialization — no initialPending flag
// ──────────────────────────────────────
// "Use current location" means the device IS at Home when registerHomeGeofence
// is called.  We arm immediately without waiting for an initial callback.
//
// iOS: may fire an initial EXIT due to GPS boundary jitter. A 10-second grace
//      window in processExitEvent absorbs it WITHOUT disarming.
// Android: fires no initial callback. The grace window expires naturally and
//          the first real EXIT works correctly — no flag to swallow it.
//
// Defensive cooldown
// ──────────────────
// A secondary 5-minute cooldown (in the state machine) prevents notification
// spam from rapid GPS jitter even if the armed/disarmed cycle fires twice.
//
// Background execution
// ─────────────────────
// TaskManager.defineTask must be at module level — called before any component
// renders.  Import "@/src/services/geofencing" in _layout.tsx at module level.
//
// Web
// ───
// All exported functions are safe no-ops when isGeofencingAvailable is false.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { CarryItem } from "@/src/data/models";
import {
  persistDepartureLifecycleEvent,
  prepareDueSchedules,
} from "@/src/data/repository";
import { buildDepartureReminder } from "@/src/services/departureReminder";
import { REMINDER_CHANNEL_ID } from "@/src/services/notifications";
import {
  clearRegistrationState,
  GEO_ARMED_KEY,
  GEO_LAST_EVENT_KEY,
  GEO_LAST_NOTIF_KEY,
  GeoStorageInterface,
  initializeRegistration,
  processEnterEvent,
  processExitEvent,
} from "@/src/services/geofencingStateMachine";

// ── Registration error storage key ───────────────────────────────────────────
// Persisted whenever startGeofencingAsync throws or post-registration
// verification fails. Read by getGeofencingDiagnostics and shown in
// the Settings dev panel so physical-device failures are surfaced clearly.
export const GEO_LAST_REG_ERROR_KEY = "carrycue_geo_last_reg_error";

// ── Adapter: wrap AsyncStorage in GeoStorageInterface ────────────────────────

const geoStorage: GeoStorageInterface = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value).then(() => undefined),
  removeItem: (key) => AsyncStorage.removeItem(key).then(() => undefined),
};

// ── Public constants ──────────────────────────────────────────────────────────

export const HOME_GEOFENCE_TASK = "CARRYCUE_HOME_GEOFENCE";
export const HOME_GEOFENCE_REGION_ID = "home";
export const GEOFENCE_RADIUS_METERS = 150;

export const isGeofencingAvailable =
  Platform.OS === "ios" || Platform.OS === "android";

// ── Background event handlers ─────────────────────────────────────────────────

async function handleEnterEvent(): Promise<void> {
  const now = Date.now();
  await processEnterEvent(geoStorage, now);
  // Initial/duplicate ENTER callbacks are harmless: cleanup only runs when a
  // previously accepted real EXIT persisted the "departed" lifecycle state.
  await persistDepartureLifecycleEvent("realEnter", new Date(now));
}

async function handleExitEvent(): Promise<void> {
  const now = Date.now();
  // Catch missed recurring and one-time preparation before selecting the
  // notification. Repository ordering is Routines, then one-time plans.
  const preparedState = await prepareDueSchedules(new Date(now));
  const activeItems = preparedState.items.filter(
    (item) =>
      !item.completed && item.trigger.type === "leavingHome",
  );
  const reminder = buildDepartureReminder(
    activeItems,
    preparedState.usageStats,
  );
  const rankedActiveItems = reminder?.items ?? [];

  const result = await processExitEvent(geoStorage, rankedActiveItems, now);

  // A valid real departure is either a notifying EXIT or an accepted EXIT
  // with no active items. Grace/cooldown/disarmed callbacks do not start one.
  if (
    result.shouldNotify ||
    (!result.shouldNotify && result.reason === "no-items")
  ) {
    await persistDepartureLifecycleEvent("realExit", new Date(now));
  }

  if (!result.shouldNotify || !reminder) return;

  // Valid departure with active items — schedule the notification.
  const { title, body } = reminder;

  const notifId = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "default", data: { screen: "home" } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });

  await AsyncStorage.setItem(
    GEO_LAST_NOTIF_KEY,
    JSON.stringify({
      id: notifId,
      timestamp: new Date(now).toISOString(),
      body,
    }),
  );
}

// ── TaskManager task definition — MUST be at module level ────────────────────
//
// Expo requires defineTask to be called before any component renders.
// Importing this module at the top of _layout.tsx guarantees that.

if (isGeofencingAvailable) {
  TaskManager.defineTask(
    HOME_GEOFENCE_TASK,
    async ({
      data,
      error,
    }: {
      data?: { eventType: number; region: { identifier: string } };
      error?: { message: string } | null;
    }) => {
      if (error) {
        console.warn("[CarryCue Geo]", error.message);
        return;
      }
      if (!data) return;

      const { eventType, region } = data;

      // Ignore events for any region other than Home (future-proofing).
      if (region?.identifier !== HOME_GEOFENCE_REGION_ID) return;

      if (eventType === Location.GeofencingEventType.Enter) {
        await handleEnterEvent();
      } else if (eventType === Location.GeofencingEventType.Exit) {
        await handleExitEvent();
      }
    },
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeofencingPermResult =
  | "granted" // foreground + background → geofence can be registered
  | "foreground-only" // foreground only → location saved, but geofence unavailable
  | "denied" // foreground denied, canAskAgain: true
  | "blocked" // permanently denied (canAskAgain: false)
  | "unavailable"; // web / unsupported platform

export type GeofenceEventLog = {
  eventType: "enter" | "exit";
  timestamp: string;
  notificationSent: boolean;
  itemCount?: number;
  note?: string;
  simulated?: boolean;
};

export type GeofencingDiagnostics = {
  foregroundPermission: string;
  backgroundPermission: string;
  homeSet: boolean;
  latitude?: number;
  longitude?: number;
  geofenceRegistered: boolean;
  registeredTasks: string[];
  armed: boolean;
  lastEvent: GeofenceEventLog | null;
  lastNotificationAt: string | null;
  /** Non-null when startGeofencingAsync threw or post-registration checks failed. */
  lastRegistrationError: { message: string; timestamp: string } | null;
};

// ── Permission helpers ────────────────────────────────────────────────────────

export async function getGeofencingPermissionStatus(): Promise<{
  foreground: string;
  background: string;
}> {
  if (!isGeofencingAvailable)
    return { foreground: "unavailable", background: "unavailable" };
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  return {
    foreground: fg.granted ? "granted" : fg.canAskAgain ? "undetermined" : "blocked",
    background: bg.granted ? "granted" : bg.canAskAgain ? "undetermined" : "blocked",
  };
}

// Request foreground then background, in the correct platform order.
export async function requestGeofencingPermission(): Promise<GeofencingPermResult> {
  if (!isGeofencingAvailable) return "unavailable";

  // Step 1 — foreground (both iOS and Android require this first).
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) {
    return fg.canAskAgain ? "denied" : "blocked";
  }

  // Step 2 — background (separate OS dialog on iOS 13+ and Android 10+).
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg.granted) {
    // Foreground was granted → location CAN be retrieved, but geofencing
    // in the background requires "Always" (iOS) / background access (Android).
    return "foreground-only";
  }

  return "granted";
}

// ── Current location ──────────────────────────────────────────────────────────

export async function getCurrentCoords(): Promise<{
  latitude: number;
  longitude: number;
}> {
  if (!isGeofencingAvailable) throw new Error("unavailable-on-web");
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
}

// ── Geofence management ───────────────────────────────────────────────────────

export async function registerHomeGeofence(coords: {
  latitude: number;
  longitude: number;
}): Promise<void> {
  if (!isGeofencingAvailable) return;

  // Unregister any existing Home geofence to avoid duplicates.
  await unregisterHomeGeofence();

  // Arm immediately: caller ("Use current location") already obtained current
  // GPS so we KNOW the device is at Home right now.
  // Record registeredAt so handleExitEvent can absorb a spurious iOS
  // initial-state EXIT in the grace window — WITHOUT disarming.
  // On Android, no initial callback fires; the grace window expires
  // naturally and the first real EXIT notifies correctly.
  await initializeRegistration(geoStorage, Date.now());

  try {
    await Location.startGeofencingAsync(HOME_GEOFENCE_TASK, [
      {
        identifier: HOME_GEOFENCE_REGION_ID,
        latitude: coords.latitude,
        longitude: coords.longitude,
        radius: GEOFENCE_RADIUS_METERS,
        notifyOnEnter: true, // ENTER is used for re-arming after return home.
        notifyOnExit: true,
      },
    ]);

    // Post-registration verification — confirm the OS actually accepted the task.
    const [taskRegistered, geofencingStarted] = await Promise.all([
      TaskManager.isTaskRegisteredAsync(HOME_GEOFENCE_TASK).catch(() => false),
      Location.hasStartedGeofencingAsync(HOME_GEOFENCE_TASK).catch(() => false),
    ]);

    if (!taskRegistered || !geofencingStarted) {
      const errMsg = `Verification failed: task=${taskRegistered}, geofencing=${geofencingStarted}`;
      await AsyncStorage.setItem(
        GEO_LAST_REG_ERROR_KEY,
        JSON.stringify({ message: errMsg, timestamp: new Date().toISOString() }),
      );
      // Surface via diagnostics only — do NOT throw, the OS may still honour it.
    } else {
      // Clear any stale error from a previous failed attempt.
      await AsyncStorage.removeItem(GEO_LAST_REG_ERROR_KEY);
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await AsyncStorage.setItem(
      GEO_LAST_REG_ERROR_KEY,
      JSON.stringify({ message: errMsg, timestamp: new Date().toISOString() }),
    );
    // Re-throw so Settings UI can display the error immediately.
    throw e;
  }
}

export async function unregisterHomeGeofence(): Promise<void> {
  if (!isGeofencingAvailable) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HOME_GEOFENCE_TASK);
    if (isRegistered) {
      await Location.stopGeofencingAsync(HOME_GEOFENCE_TASK);
    }
  } catch {
    // Throws if the task was never started — safe to ignore.
  }
  // Clear transient state so no stale arm/grace-window lingers.
  await clearRegistrationState(geoStorage);
}

export async function isHomeGeofenceRegistered(): Promise<boolean> {
  if (!isGeofencingAvailable) return false;
  try {
    return await TaskManager.isTaskRegisteredAsync(HOME_GEOFENCE_TASK);
  } catch {
    return false;
  }
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export async function getGeofencingDiagnostics(homeCoords?: {
  latitude?: number;
  longitude?: number;
}): Promise<GeofencingDiagnostics> {
  if (!isGeofencingAvailable) {
    return {
      foregroundPermission: "unavailable",
      backgroundPermission: "unavailable",
      homeSet: false,
      geofenceRegistered: false,
      registeredTasks: [],
      armed: false,
      lastEvent: null,
      lastNotificationAt: null,
      lastRegistrationError: null,
    };
  }

  const perms = await getGeofencingPermissionStatus();
  const geofenceRegistered = await isHomeGeofenceRegistered();
  const armedRaw = await AsyncStorage.getItem(GEO_ARMED_KEY);
  const armed = armedRaw === "true";

  let registeredTasks: string[] = [];
  try {
    const tasks = await TaskManager.getRegisteredTasksAsync();
    registeredTasks = tasks.map((t) => t.taskName);
  } catch {}

  let lastEvent: GeofenceEventLog | null = null;
  try {
    const raw = await AsyncStorage.getItem(GEO_LAST_EVENT_KEY);
    if (raw) lastEvent = JSON.parse(raw) as GeofenceEventLog;
  } catch {}

  let lastNotificationAt: string | null = null;
  try {
    const raw = await AsyncStorage.getItem(GEO_LAST_NOTIF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { timestamp: string };
      lastNotificationAt = parsed.timestamp;
    }
  } catch {}

  let lastRegistrationError: { message: string; timestamp: string } | null = null;
  try {
    const raw = await AsyncStorage.getItem(GEO_LAST_REG_ERROR_KEY);
    if (raw) lastRegistrationError = JSON.parse(raw) as { message: string; timestamp: string };
  } catch {}

  return {
    foregroundPermission: perms.foreground,
    backgroundPermission: perms.background,
    homeSet: homeCoords?.latitude != null && homeCoords?.longitude != null,
    latitude: homeCoords?.latitude,
    longitude: homeCoords?.longitude,
    geofenceRegistered,
    registeredTasks,
    armed,
    lastEvent,
    lastNotificationAt,
    lastRegistrationError,
  };
}

// ── Startup self-healing ──────────────────────────────────────────────────────
//
// Called once when the store finishes hydrating (via GeofenceHealer in
// _layout.tsx).  If the OS killed the background task (common after iOS
// memory pressure or force-quit), this re-registers the geofence WITHOUT
// resetting the armed/disarmed state machine so the departure cycle resumes
// seamlessly after any app restart.

export async function healGeofenceOnStartup(homeCoords: {
  latitude: number;
  longitude: number;
}): Promise<void> {
  if (!isGeofencingAvailable) return;

  // Only heal when background permission is still "Always" / "granted".
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted) return;
  } catch {
    return;
  }

  // Nothing to heal — task is already registered.
  const alreadyRegistered = await isHomeGeofenceRegistered();
  if (alreadyRegistered) return;

  console.log("[CarryCue Geo] Startup self-heal: task missing, re-registering…");

  try {
    // Defensive stop of any zombie remnant — normally a no-op.
    try {
      const hasTask = await TaskManager.isTaskRegisteredAsync(HOME_GEOFENCE_TASK);
      if (hasTask) await Location.stopGeofencingAsync(HOME_GEOFENCE_TASK);
    } catch { /* ignore */ }

    await Location.startGeofencingAsync(HOME_GEOFENCE_TASK, [
      {
        identifier: HOME_GEOFENCE_REGION_ID,
        latitude: homeCoords.latitude,
        longitude: homeCoords.longitude,
        radius: GEOFENCE_RADIUS_METERS,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);

    // Clear any stale registration error from a previous failure.
    await AsyncStorage.removeItem(GEO_LAST_REG_ERROR_KEY);
    console.log("[CarryCue Geo] Startup self-heal: success");
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await AsyncStorage.setItem(
      GEO_LAST_REG_ERROR_KEY,
      JSON.stringify({
        message: `[startup-heal] ${errMsg}`,
        timestamp: new Date().toISOString(),
      }),
    );
    console.warn("[CarryCue Geo] Startup self-heal failed:", errMsg);
  }
}

// ── Simulate exit (developer only) ────────────────────────────────────────────
//
// Executes the same notification + log logic that a real EXIT would trigger.
// Bypasses the geofence, arm state, and defensive cooldown so developers can
// test notification appearance and item-list behaviour without physical movement.
// Real OS geofence behaviour still requires a device build + movement.

export async function simulateHomeExit(
  activeItems: CarryItem[],
): Promise<{ notificationSent: boolean; reason?: string }> {
  if (!isGeofencingAvailable)
    return { notificationSent: false, reason: "unavailable-on-web" };
  const now = Date.now();
  // Explicit non-destructive event: the pure lifecycle transform returns the
  // current state unchanged and repository persistence therefore performs no write.
  const lifecycle = await persistDepartureLifecycleEvent(
    "simulatedExit",
    new Date(now),
  );
  const reminder = buildDepartureReminder(
    activeItems,
    lifecycle.state.usageStats,
  );
  if (!reminder)
    return { notificationSent: false, reason: "no-active-items" };

  const { title, body, items } = reminder;

  const notifId = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "default", data: { screen: "home" } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });

  await AsyncStorage.setItem(
    GEO_LAST_EVENT_KEY,
    JSON.stringify({
      eventType: "exit",
      timestamp: new Date(now).toISOString(),
      notificationSent: true,
      itemCount: items.length,
      simulated: true,
    }),
  );
  await AsyncStorage.setItem(
    GEO_LAST_NOTIF_KEY,
    JSON.stringify({ id: notifId, timestamp: new Date(now).toISOString(), body }),
  );

  return { notificationSent: true };
}
