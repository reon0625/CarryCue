// CarryCue notification service — Step 3A (real, device-local reminders).
//
// This is the ONLY module allowed to import `expo-notifications` directly.
// Screens and state (store.tsx) must go through the functions exported
// here instead of touching native notification APIs themselves. That keeps
// the architecture ready for Step 3B (location-based reminders) to plug in
// alongside this without screens needing to change.
//
// Scope: local/scheduled notifications only. No push tokens, no backend,
// no geofencing. Safe no-op on web — never pretends a real OS notification
// was scheduled there.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const REMINDER_CHANNEL_ID = "reminders";

export const isNotificationsAvailable = Platform.OS === "ios" || Platform.OS === "android";

export type PermissionStatus = {
  status: "granted" | "denied" | "undetermined" | "unavailable";
  canAskAgain: boolean;
};

// Foreground display behavior.
//
// MUST be called at module level in _layout.tsx BEFORE any component
// renders so that iOS has a handler registered when a notification
// arrives while the app is in the foreground.  Calling it multiple
// times is safe — expo-notifications simply replaces the previous handler.
export function registerForegroundHandler(): void {
  if (!isNotificationsAvailable) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Creates the single "Reminders" Android channel at runtime. Idempotent —
// safe to call from multiple places (app start, before requesting
// permission, before every schedule) without side effects after the first
// successful call.
let channelReady = false;
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || channelReady) return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  channelReady = true;
}

function toStatus(result: Notifications.NotificationPermissionsStatus): PermissionStatus {
  return {
    status: result.granted ? "granted" : result.status === "denied" ? "denied" : "undetermined",
    canAskAgain: result.canAskAgain,
  };
}

// Reads current permission WITHOUT prompting the OS dialog. Safe to call at
// any time, including app launch — never triggers the native popup.
export async function getPermissionStatus(): Promise<PermissionStatus> {
  if (!isNotificationsAvailable) return { status: "unavailable", canAskAgain: false };
  const result = await Notifications.getPermissionsAsync();
  return toStatus(result);
}

// Shows the native OS permission dialog. Only call this AFTER the user has
// already seen CarryCue's own explanation sheet and tapped "Remind me".
export async function requestPermission(): Promise<PermissionStatus> {
  if (!isNotificationsAvailable) return { status: "unavailable", canAskAgain: false };
  await ensureAndroidChannel();
  const result = await Notifications.requestPermissionsAsync();
  return toStatus(result);
}

export type ScheduleParams = {
  title: string;
  body: string;
  date: Date;
  // Previous OS notification id for this same reminder (if any) — cancelled
  // first so changing a reminder replaces it instead of duplicating it.
  previousId?: string;
};

// Schedules a single local notification for an exact date/time and returns
// its OS identifier (needed later to cancel/replace it). Throws:
//  - "unavailable-on-web" on web — callers must handle this and must NOT
//    tell the user a real notification was scheduled.
//  - "date-in-past" if the target time isn't in the future.
export async function scheduleAt(params: ScheduleParams): Promise<string> {
  if (!isNotificationsAvailable) throw new Error("unavailable-on-web");
  if (params.date.getTime() <= Date.now()) throw new Error("date-in-past");

  if (params.previousId) {
    await cancel(params.previousId);
  }
  await ensureAndroidChannel();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      sound: "default",
      data: { screen: "home" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: params.date,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
}

// Cancels a previously scheduled local notification. Swallows errors (e.g.
// already fired, or an id from a previous install) so delete/undo flows
// never crash because of a stale identifier.
export async function cancel(notificationId: string | undefined): Promise<void> {
  if (!isNotificationsAvailable || !notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Nothing to do — already gone.
  }
}

// ----- Developer diagnostic tools -------------------------------------------
// All three functions below are only called from the __DEV__-gated Settings
// dev-tools section and are never included in a production build tree-shake.

// Rich diagnostics returned by every dev test so the developer can see
// exactly what happened — permission state, OS queue contents, trigger format.
export type NotificationTestResult = {
  platform: string;
  permissionStatus: string;
  canAskAgain: boolean;
  notificationId?: string;
  pendingCount: number;
  // The OS trigger object stored alongside the scheduled notification.
  // null = no pending notifications or test was blocked by permission.
  pendingTrigger?: unknown;
  // Set when something prevented delivery (permission denied, OS dropped it, etc.).
  error?: string;
};

// Pure status check — never schedules anything.
export async function getNotificationDiagnostics(): Promise<NotificationTestResult> {
  if (!isNotificationsAvailable) {
    return { platform: Platform.OS, permissionStatus: "unavailable", canAskAgain: false, pendingCount: 0 };
  }
  const perm = await getPermissionStatus();
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const latest = pending[0] ?? null;
  return {
    platform: Platform.OS,
    permissionStatus: perm.status,
    canAskAgain: perm.canAskAgain,
    pendingCount: pending.length,
    pendingTrigger: latest ? latest.trigger : null,
  };
}

// Developer-only: schedules a ~1s notification to test PRESENTATION
// (foreground banner) independently of delayed scheduling.
export async function scheduleImmediateNotification(): Promise<NotificationTestResult> {
  if (!isNotificationsAvailable) {
    return { platform: Platform.OS, permissionStatus: "unavailable", canAskAgain: false, pendingCount: 0, error: "unavailable-on-web" };
  }
  const perm = await getPermissionStatus();
  if (perm.status !== "granted") {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return {
      platform: Platform.OS,
      permissionStatus: perm.status,
      canAskAgain: perm.canAskAgain,
      pendingCount: pending.length,
      error: `Permission is ${perm.status.toUpperCase()} — notification will NOT be delivered. canAskAgain: ${perm.canAskAgain}`,
    };
  }
  await ensureAndroidChannel();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "CarryCue — send now",
      body: "Foreground & background presentation test.",
      sound: "default",
      data: { screen: "home" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const scheduled = pending.find((n) => n.identifier === id);
  return {
    platform: Platform.OS,
    permissionStatus: perm.status,
    canAskAgain: perm.canAskAgain,
    notificationId: id,
    pendingCount: pending.length,
    pendingTrigger: scheduled ? scheduled.trigger : null,
  };
}

// Developer-only: schedules a notification ~10s out, to test DELAYED delivery.
// Now returns rich diagnostics and verifies the OS queue after scheduling.
export async function scheduleDevTestNotification(): Promise<NotificationTestResult> {
  if (!isNotificationsAvailable) {
    return { platform: Platform.OS, permissionStatus: "unavailable", canAskAgain: false, pendingCount: 0, error: "unavailable-on-web" };
  }
  // CRITICAL: iOS scheduleNotificationAsync() returns an ID even when
  // permission is denied — but the OS silently drops the notification.
  // Always check first so the developer gets a clear error instead of
  // a misleading "scheduled" success.
  const perm = await getPermissionStatus();
  if (perm.status !== "granted") {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return {
      platform: Platform.OS,
      permissionStatus: perm.status,
      canAskAgain: perm.canAskAgain,
      pendingCount: pending.length,
      error: `Permission is ${perm.status.toUpperCase()} — notification will NOT be delivered. canAskAgain: ${perm.canAskAgain}`,
    };
  }
  await ensureAndroidChannel();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "CarryCue test",
      body: "10-second scheduling test.",
      sound: "default",
      data: { screen: "home" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      repeats: false,
      ...(Platform.OS === "android" ? { channelId: REMINDER_CHANNEL_ID } : {}),
    },
  });
  // Verify the notification actually landed in the OS pending queue.
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const scheduled = pending.find((n) => n.identifier === id);
  if (!scheduled) {
    return {
      platform: Platform.OS,
      permissionStatus: perm.status,
      canAskAgain: perm.canAskAgain,
      notificationId: id,
      pendingCount: pending.length,
      error: "scheduleNotificationAsync returned an ID but it is NOT in the OS pending queue — trigger format may be wrong.",
    };
  }
  return {
    platform: Platform.OS,
    permissionStatus: perm.status,
    canAskAgain: perm.canAskAgain,
    notificationId: id,
    pendingCount: pending.length,
    pendingTrigger: scheduled.trigger,
  };
}

// --- Tap handling ---------------------------------------------------------
// Every CarryCue notification routes to the same place (Home / Before You
// Go) — there's no per-notification details screen.

export async function getLaunchResponse(): Promise<Notifications.NotificationResponse | null> {
  if (!isNotificationsAvailable) return null;
  return Notifications.getLastNotificationResponseAsync();
}

export function addResponseListener(
  callback: (response: Notifications.NotificationResponse) => void,
): { remove: () => void } {
  if (!isNotificationsAvailable) return { remove: () => {} };
  return Notifications.addNotificationResponseReceivedListener(callback);
}
