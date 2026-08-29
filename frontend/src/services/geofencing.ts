// CarryCue — Step 3B: Real Geofencing Service.
//
// Architecture
// ───────────
// One 150-metre Home geofence (EXIT-only for notifications, ENTER for re-arm).
// State is persisted to AsyncStorage so it survives app termination.
//
// Armed / disarmed departure cycle
// ─────────────────────────────────
//  registerHomeGeofence()  →  armed = true, initialPending = true
//  ENTER (re-arm)          →  armed = true   (no notification)
//  EXIT (depart)           →  if armed → notify + disarm
//                             if NOT armed → duplicate/initial, skip
//
// Initial-state callback
// ─────────────────────
// When startGeofencingAsync is called, iOS/Android may immediately fire one
// region-state event (ENTER if inside, EXIT if outside).  The `initialPending`
// flag consumes that first event without treating it as a real departure.
//
// Defensive cooldown
// ──────────────────
// A secondary 5-minute cooldown prevents notification spam from rapid GPS
// jitter even if the armed/disarmed cycle somehow fires twice.
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

import { loadStateForBackgroundTask } from "@/src/data/repository";
import { REMINDER_CHANNEL_ID } from "@/src/services/notifications";

// ── AsyncStorage keys (private to this module) ───────────────────────────────

const GEO_ARMED_KEY = "carrycue_geo_armed";
const GEO_INITIAL_PENDING_KEY = "carrycue_geo_initial_pending";
const GEO_LAST_EXIT_TS_KEY = "carrycue_geo_last_exit_ts";
const GEO_LAST_EVENT_KEY = "carrycue_geo_last_event";
const GEO_LAST_NOTIF_KEY = "carrycue_geo_last_notif";

// ── Public constants ──────────────────────────────────────────────────────────

export const HOME_GEOFENCE_TASK = "CARRYCUE_HOME_GEOFENCE";
export const HOME_GEOFENCE_REGION_ID = "home";
export const GEOFENCE_RADIUS_METERS = 150;

const DEFENSIVE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export const isGeofencingAvailable =
  Platform.OS === "ios" || Platform.OS === "android";

// ── Private helpers: arm state ───────────────────────────────────────────────

async function readArmed(): Promise<boolean> {
  const v = await AsyncStorage.getItem(GEO_ARMED_KEY);
  return v === "true";
}

async function writeArmed(v: boolean): Promise<void> {
  await AsyncStorage.setItem(GEO_ARMED_KEY, v ? "true" : "false");
}

async function readInitialPending(): Promise<boolean> {
  const v = await AsyncStorage.getItem(GEO_INITIAL_PENDING_KEY);
  return v === "true";
}

async function writeInitialPending(v: boolean): Promise<void> {
  await AsyncStorage.setItem(GEO_INITIAL_PENDING_KEY, v ? "true" : "false");
}

async function readLastExitTs(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(GEO_LAST_EXIT_TS_KEY);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

// ── Background event handlers ─────────────────────────────────────────────────

async function handleEnterEvent(): Promise<void> {
  const isPending = await readInitialPending();
  if (isPending) {
    // Initial state callback fired as ENTER → user is inside Home.
    // Arm the cycle and clear the pending flag.
    await writeInitialPending(false);
    await writeArmed(true);
    await AsyncStorage.setItem(
      GEO_LAST_EVENT_KEY,
      JSON.stringify({
        eventType: "enter",
        timestamp: new Date().toISOString(),
        notificationSent: false,
        note: "initial-state",
      }),
    );
    return;
  }
  // Normal re-entry: user returned home → re-arm for next departure.
  await writeArmed(true);
  await AsyncStorage.setItem(
    GEO_LAST_EVENT_KEY,
    JSON.stringify({
      eventType: "enter",
      timestamp: new Date().toISOString(),
      notificationSent: false,
    }),
  );
}

async function handleExitEvent(): Promise<void> {
  const now = Date.now();
  const isPending = await readInitialPending();

  if (isPending) {
    // Initial state callback fired as EXIT → user was outside Home at
    // registration time.  Disarm and skip — this is NOT a departure.
    await writeInitialPending(false);
    await writeArmed(false);
    await AsyncStorage.setItem(
      GEO_LAST_EVENT_KEY,
      JSON.stringify({
        eventType: "exit",
        timestamp: new Date(now).toISOString(),
        notificationSent: false,
        note: "initial-state-outside",
      }),
    );
    return;
  }

  const armed = await readArmed();
  if (!armed) {
    // Duplicate EXIT (GPS jitter or already disarmed) — log and skip.
    await AsyncStorage.setItem(
      GEO_LAST_EVENT_KEY,
      JSON.stringify({
        eventType: "exit",
        timestamp: new Date(now).toISOString(),
        notificationSent: false,
        note: "skipped-disarmed",
      }),
    );
    return;
  }

  // Defensive cooldown: secondary protection against rapid repeated events.
  const lastExit = await readLastExitTs();
  if (lastExit !== null && now - lastExit < DEFENSIVE_COOLDOWN_MS) {
    // Still within the 5-minute window — disarm but don't notify.
    await writeArmed(false);
    await AsyncStorage.setItem(
      GEO_LAST_EVENT_KEY,
      JSON.stringify({
        eventType: "exit",
        timestamp: new Date(now).toISOString(),
        notificationSent: false,
        note: "skipped-defensive-cooldown",
      }),
    );
    return;
  }

  // ── Valid departure: disarm immediately before any await that could fail ──

  await writeArmed(false);
  await AsyncStorage.setItem(GEO_LAST_EXIT_TS_KEY, String(now));

  // Read active leavingHome items from persisted state.
  // Repository handles schema parsing; background task never touches
  // raw schema internals.
  const loaded = await loadStateForBackgroundTask();
  const activeItems = loaded?.activeItems ?? [];

  // Log the event regardless of whether we notify.
  await AsyncStorage.setItem(
    GEO_LAST_EVENT_KEY,
    JSON.stringify({
      eventType: "exit",
      timestamp: new Date(now).toISOString(),
      notificationSent: activeItems.length > 0,
      itemCount: activeItems.length,
    }),
  );

  // No active items → stay quiet.
  if (activeItems.length === 0) return;

  // Schedule the departure notification.
  const title = "Before you go";
  const body =
    activeItems.length === 1
      ? `Don't forget ${activeItems[0].name}.`
      : `${activeItems.length} things to remember.`;

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

  // Arm the departure cycle BEFORE startGeofencingAsync so that if the OS
  // fires the initial-state callback synchronously, the state is already set.
  await writeArmed(true);
  await writeInitialPending(true);

  await Location.startGeofencingAsync(HOME_GEOFENCE_TASK, [
    {
      identifier: HOME_GEOFENCE_REGION_ID,
      latitude: coords.latitude,
      longitude: coords.longitude,
      radius: GEOFENCE_RADIUS_METERS,
      notifyOnEnter: true, // ENTER is used for re-arming.
      notifyOnExit: true,
    },
  ]);
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
  // Also disarm and clear initial-pending when geofence is removed.
  await writeArmed(false);
  await writeInitialPending(false);
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
    };
  }

  const perms = await getGeofencingPermissionStatus();
  const geofenceRegistered = await isHomeGeofenceRegistered();
  const armed = await readArmed();

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
  };
}

// ── Simulate exit (developer only) ────────────────────────────────────────────
//
// Executes the same notification + log logic that a real EXIT would trigger.
// Bypasses the geofence, arm state, and defensive cooldown so developers can
// test notification appearance and item-list behaviour without physical movement.
// Real OS geofence behaviour still requires a device build + movement.

export async function simulateHomeExit(
  activeItems: { name: string }[],
): Promise<{ notificationSent: boolean; reason?: string }> {
  if (!isGeofencingAvailable)
    return { notificationSent: false, reason: "unavailable-on-web" };
  if (activeItems.length === 0)
    return { notificationSent: false, reason: "no-active-items" };

  const now = Date.now();
  const title = "Before you go";
  const body =
    activeItems.length === 1
      ? `Don't forget ${activeItems[0].name}.`
      : `${activeItems.length} things to remember.`;

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
      itemCount: activeItems.length,
      simulated: true,
    }),
  );
  await AsyncStorage.setItem(
    GEO_LAST_NOTIF_KEY,
    JSON.stringify({ id: notifId, timestamp: new Date(now).toISOString(), body }),
  );

  return { notificationSent: true };
}
