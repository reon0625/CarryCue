import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/src/components/BottomSheet";
import { Chip } from "@/src/components/Chip";
import { PermissionExplanation } from "@/src/components/PermissionExplanation";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionLabel } from "@/src/components/SectionLabel";
import { Toast } from "@/src/components/Toast";
import {
  getNotificationDiagnostics,
  isNotificationsAvailable,
  NotificationTestResult,
  requestPermission,
  scheduleDevTestNotification,
  scheduleImmediateNotification,
} from "@/src/services/notifications";
import {
  GeofencingDiagnostics,
  getCurrentCoords,
  getGeofencingDiagnostics,
  isGeofencingAvailable,
  registerHomeGeofence,
  requestGeofencingPermission,
  simulateHomeExit,
  unregisterHomeGeofence,
} from "@/src/services/geofencing";
import {
  LinkDiagnostics,
  readLinkDiagnostics,
} from "@/src/services/linkHandling";
import { TextButton } from "@/src/components/TextButton";
import { useRevenueCat } from "@/src/services/revenueCat";
import { useStore } from "@/src/state/store";
import { colors, font, radius, spacing, type } from "@/src/theme";

type Sheet = null | "notifications" | "location" | "ok";
type LocationSubState = "explain" | "requesting" | "success" | "foreground-only" | "blocked" | "manage";

// Developer diagnostics display component — only rendered inside __DEV__ block.
function DiagRow({
  label,
  value,
  isError,
}: {
  label: string;
  value: string;
  isError?: boolean;
}) {
  return (
    <View style={diagStyles.row}>
      <Text style={diagStyles.label}>{label}</Text>
      <Text style={[diagStyles.value, isError && diagStyles.valueError]} selectable>
        {value}
      </Text>
    </View>
  );
}

function Row({
  label,
  subtitle,
  onPress,
  accent,
  testID,
}: {
  label: string;
  subtitle?: string;
  onPress?: () => void;
  accent?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, accent && styles.rowAccent]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={accent ? colors.accent : colors.disabled}
      />
    </Pressable>
  );
}

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    entitlement, setEntitlementDev, resetAllDataDev, setNotificationsEnabled,
    locations, items, setHomeLocation, clearHomeLocation,
  } = useStore();
  const { busy: purchasesBusy, presentPaywall, restorePurchases } = useRevenueCat();

  // Derived home-location state
  const home = locations.find((l) => l.isDefault) ?? locations[0];
  const homeIsSet = home?.latitude != null && home?.longitude != null;

  const [sheet, setSheet] = useState<Sheet>(null);
  const [locationSubState, setLocationSubState] = useState<LocationSubState>("explain");
  const [toast, setToast] = useState("");
  const [diagResult, setDiagResult] = useState<NotificationTestResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [geoDiag, setGeoDiag] = useState<GeofencingDiagnostics | null>(null);
  const [geoDiagLoading, setGeoDiagLoading] = useState(false);
  const [linkDiag, setLinkDiag] = useState<LinkDiagnostics | null>(null);
  const [linkDiagLoading, setLinkDiagLoading] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }, []);

  const handleReset = () => {
    resetAllDataDev();
    flash("Local data reset");
  };

  const handleSwitchTier = (tier: "FREE" | "PRO") => {
    if (tier === entitlement) return;
    setEntitlementDev(tier);
    flash(`Switched to ${tier} (dev)`);
  };

  const handlePresentPaywall = async () => {
    if (purchasesBusy || entitlement === "PRO") return;
    const result = await presentPaywall();
    if (result.status === "purchased" || result.status === "restored") {
      flash("CarryCue Pro unlocked");
    } else if (result.status === "error" || result.status === "unavailable") {
      flash("Purchases are temporarily unavailable");
    }
  };

  const handleRestorePurchases = async () => {
    if (purchasesBusy) return;
    const result = await restorePurchases();
    if (result.status === "restored" || result.status === "already-premium") {
      flash("CarryCue Pro restored");
    } else if (result.status === "no-active-purchase") {
      flash("No active purchase found");
    } else if (result.status === "error" || result.status === "unavailable") {
      flash("Could not restore purchases");
    }
  };

  // Dev-only: pure diagnostics check — no scheduling.
  const handleDevDiagnostics = async () => {
    if (!__DEV__) return;
    setDiagLoading(true);
    try {
      const result = await getNotificationDiagnostics();
      setDiagResult(result);
      flash("Diagnostics refreshed");
    } catch (e: unknown) {
      flash(`Diagnostics error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiagLoading(false);
    }
  };

  // Dev-only: request OS permission directly (useful when status is undetermined).
  const handleDevRequestPermission = async () => {
    if (!__DEV__) return;
    if (!isNotificationsAvailable) {
      flash("Notifications require a native device build");
      return;
    }
    setDiagLoading(true);
    try {
      const result = await requestPermission();
      setDiagResult({
        platform: "ios/android",
        permissionStatus: result.status,
        canAskAgain: result.canAskAgain,
        pendingCount: 0,
      });
      flash(`Permission: ${result.status}`);
    } catch (e: unknown) {
      flash(`Permission error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiagLoading(false);
    }
  };

  // Dev-only: 1-second notification — tests PRESENTATION separately from scheduling.
  const handleDevNotificationNow = async () => {
    if (!__DEV__) return;
    if (!isNotificationsAvailable) {
      flash("Notifications require a native device build");
      return;
    }
    setDiagLoading(true);
    try {
      const result = await scheduleImmediateNotification();
      setDiagResult(result);
      if (result.error) {
        flash(`BLOCKED: ${result.error}`);
      } else {
        flash(`Sending in ~1s — ${result.pendingCount} pending`);
      }
    } catch (e: unknown) {
      flash(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiagLoading(false);
    }
  };

  // Dev-only: 10-second notification — tests delayed scheduling + OS queue verification.
  const handleDevTestNotification = async () => {
    if (!__DEV__) return;
    if (!isNotificationsAvailable) {
      flash("Notifications require a native device build");
      return;
    }
    setDiagLoading(true);
    try {
      const result = await scheduleDevTestNotification();
      setDiagResult(result);
      if (result.error) {
        flash(`BLOCKED: ${result.error}`);
      } else {
        flash(`Scheduled — ${result.pendingCount} pending in OS queue`);
      }
    } catch (e: unknown) {
      flash(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDiagLoading(false);
    }
  };

  // ── Location / geofencing handlers ─────────────────────────────────────────

  const openLocationSheet = useCallback(() => {
    setLocationSubState(homeIsSet ? "manage" : "explain");
    setSheet("location");
  }, [homeIsSet]);

  const handleUseCurrentLocation = useCallback(async () => {
    setLocationSubState("requesting");
    try {
      const permResult = await requestGeofencingPermission();

      if (permResult === "blocked") {
        setLocationSubState("blocked");
        return;
      }
      if (permResult === "denied") {
        setLocationSubState("explain");
        flash("Location permission needed to set Home");
        return;
      }

      // foreground-only or granted — can get GPS coordinates.
      const coords = await getCurrentCoords();
      setHomeLocation(coords);

      if (permResult === "granted") {
        await registerHomeGeofence(coords);
        setLocationSubState("success");
      } else {
        // Foreground-only: coordinates saved but background access needed
        // for automatic departure detection.
        setLocationSubState("foreground-only");
      }
    } catch (e: unknown) {
      setLocationSubState("explain");
      flash(`Could not get location: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [setHomeLocation, flash]);

  const handleRemoveHomeLocation = useCallback(async () => {
    clearHomeLocation();
    await unregisterHomeGeofence();
    setSheet(null);
    flash("Home location removed");
  }, [clearHomeLocation, flash]);

  // ── Geofencing dev diagnostics ──────────────────────────────────────────────

  const handleGeoDiagnostics = useCallback(async () => {
    if (!__DEV__) return;
    setGeoDiagLoading(true);
    try {
      const diag = await getGeofencingDiagnostics({
        latitude: home?.latitude,
        longitude: home?.longitude,
      });
      setGeoDiag(diag);
      flash("Geo diagnostics refreshed");
    } catch (e: unknown) {
      flash(`Geo diag error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeoDiagLoading(false);
    }
  }, [home?.latitude, home?.longitude, flash]);

  const handleSimulateExit = useCallback(async () => {
    if (!__DEV__) return;
    if (!isGeofencingAvailable) {
      flash("Geofencing requires a native device build");
      return;
    }
    setGeoDiagLoading(true);
    try {
      const leavingItems = items.filter(
        (i) => !i.completed && i.trigger.type === "leavingHome",
      );
      const result = await simulateHomeExit(leavingItems);
      if (result.notificationSent) {
        flash(`Simulated exit — notification sent (${leavingItems.length} items)`);
      } else {
        flash(`Simulated exit — no notification: ${result.reason}`);
      }
      // Refresh geo diagnostics to show updated last event.
      const diag = await getGeofencingDiagnostics({
        latitude: home?.latitude,
        longitude: home?.longitude,
      });
      setGeoDiag(diag);
    } catch (e: unknown) {
      flash(`Simulate error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeoDiagLoading(false);
    }
  }, [items, home?.latitude, home?.longitude, flash]);

  // ── Link diagnostics (dev only) ────────────────────────────────────────────

  const handleLinkDiagnostics = useCallback(async () => {
    if (!__DEV__) return;
    setLinkDiagLoading(true);
    try {
      const diag = await readLinkDiagnostics();
      setLinkDiag(diag);
      flash(diag ? "Link diagnostics loaded" : "No link received yet");
    } catch (e: unknown) {
      flash(`Link diag error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinkDiagLoading(false);
    }
  }, [flash]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Settings" showBack />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.group}>
          <Row
            testID="settings-carrycue-pro"
            label="CarryCue Pro"
            subtitle={entitlement === "PRO" ? "Active" : "Free plan"}
            onPress={entitlement === "FREE" ? handlePresentPaywall : undefined}
          />
          <View style={styles.sep} />
          <Row
            testID="settings-restore-purchases"
            label={purchasesBusy ? "Checking purchases…" : "Restore purchases"}
            onPress={handleRestorePurchases}
          />
        </View>

        <View style={styles.group}>
          <Row
            testID="settings-home-location"
            label="Home location"
            subtitle={homeIsSet ? "Location set" : "Not set"}
            onPress={openLocationSheet}
          />
          <View style={styles.sep} />
          <Row
            testID="settings-notifications"
            label="Notifications"
            onPress={() => setSheet("notifications")}
          />
          <View style={styles.sep} />
          <Row
            testID="settings-routines"
            label="Routines"
            onPress={() => router.push("/routines")}
          />
          <View style={styles.sep} />
          <Row testID="settings-quick-add" label="Quick Add shortcuts" onPress={() => router.push("/shortcuts")} />
          <View style={styles.sep} />
          <Row testID="settings-privacy" label="Privacy" />
          <View style={styles.sep} />
          <Row testID="settings-about" label="About" />
        </View>

        <View style={styles.group}>
          <Row
            testID="settings-demo-forgot"
            label="Demo: Forgot Something"
            accent
            onPress={() => router.push("/forgot")}
          />
        </View>

        {__DEV__ ? (
          <View style={styles.group} testID="dev-tools-section">
            <View style={styles.devHeader}>
              <SectionLabel>Developer tools</SectionLabel>
            </View>
            <View style={styles.devRow}>
              <Text style={styles.rowLabel}>Entitlement</Text>
              <View style={styles.devChips}>
                <Chip
                  testID="dev-set-free"
                  label="FREE"
                  selected={entitlement === "FREE"}
                  onPress={() => handleSwitchTier("FREE")}
                />
                <Chip
                  testID="dev-set-pro"
                  label="PRO"
                  selected={entitlement === "PRO"}
                  onPress={() => handleSwitchTier("PRO")}
                />
              </View>
            </View>
            <View style={styles.sep} />
            <Row testID="dev-reset-data" label="Reset local data" accent onPress={handleReset} />
            <View style={styles.sep} />
            <Row
              testID="dev-diagnostics"
              label={diagLoading ? "Checking…" : "Notification diagnostics"}
              onPress={handleDevDiagnostics}
            />
            <View style={styles.sep} />
            <Row
              testID="dev-request-permission"
              label="Request notification permission"
              onPress={handleDevRequestPermission}
            />
            <View style={styles.sep} />
            <Row
              testID="dev-notify-now"
              label="Send notification now (1s)"
              accent
              onPress={handleDevNotificationNow}
            />
            <View style={styles.sep} />
            <Row
              testID="dev-test-notification"
              label="Schedule notification (10s)"
              accent
              onPress={handleDevTestNotification}
            />
            {diagResult ? (
              <View style={diagStyles.block}>
                <View style={diagStyles.titleRow}>
                  <Text style={diagStyles.title}>Notification Diagnostics</Text>
                  {diagLoading ? <ActivityIndicator size="small" color="#888" /> : null}
                </View>
                <DiagRow label="platform" value={diagResult.platform} />
                <DiagRow
                  label="permission"
                  value={diagResult.permissionStatus}
                  isError={diagResult.permissionStatus !== "granted"}
                />
                <DiagRow label="canAskAgain" value={String(diagResult.canAskAgain)} />
                <DiagRow label="pending" value={String(diagResult.pendingCount)} />
                {diagResult.notificationId ? (
                  <DiagRow label="notif_id" value={diagResult.notificationId} />
                ) : null}
                {diagResult.pendingTrigger != null ? (
                  <DiagRow
                    label="trigger"
                    value={JSON.stringify(diagResult.pendingTrigger)}
                  />
                ) : null}
                {diagResult.error ? (
                  <DiagRow label="ERROR" value={diagResult.error} isError />
                ) : null}
                {diagResult.permissionStatus !== "granted" ? (
                  <Pressable
                    style={diagStyles.settingsBtn}
                    onPress={() => Linking.openSettings()}
                  >
                    <Text style={diagStyles.settingsBtnText}>Open iPhone Settings →</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* ── Geofencing dev tools ── */}
            <View style={styles.sep} />
            <Row
              testID="dev-geo-diagnostics"
              label={geoDiagLoading ? "Checking geo…" : "Geofencing diagnostics"}
              onPress={handleGeoDiagnostics}
            />
            <View style={styles.sep} />
            <Row
              testID="dev-simulate-exit"
              label="Simulate Home Exit"
              accent
              onPress={handleSimulateExit}
            />
            {geoDiag ? (
              <View style={diagStyles.block}>
                <View style={diagStyles.titleRow}>
                  <Text style={diagStyles.title}>Geofencing Diagnostics</Text>
                  {geoDiagLoading ? (
                    <ActivityIndicator size="small" color="#888" />
                  ) : null}
                </View>
                <DiagRow label="fg_perm" value={geoDiag.foregroundPermission}
                  isError={geoDiag.foregroundPermission !== "granted"} />
                <DiagRow label="bg_perm" value={geoDiag.backgroundPermission}
                  isError={geoDiag.backgroundPermission !== "granted"} />
                <DiagRow label="home_set" value={String(geoDiag.homeSet)} />
                {geoDiag.latitude != null ? (
                  <DiagRow label="lat" value={geoDiag.latitude.toFixed(6)} />
                ) : null}
                {geoDiag.longitude != null ? (
                  <DiagRow label="lng" value={geoDiag.longitude.toFixed(6)} />
                ) : null}
                <DiagRow label="geofence" value={String(geoDiag.geofenceRegistered)}
                  isError={!geoDiag.geofenceRegistered} />
                {geoDiag.lastRegistrationError ? (
                  <>
                    <DiagRow
                      label="last_reg_err"
                      value={geoDiag.lastRegistrationError.message}
                      isError
                    />
                    <DiagRow
                      label="reg_err_ts"
                      value={geoDiag.lastRegistrationError.timestamp}
                    />
                  </>
                ) : null}
                <DiagRow label="armed" value={String(geoDiag.armed)} />
                <DiagRow label="tasks"
                  value={geoDiag.registeredTasks.length > 0 ? geoDiag.registeredTasks.join(", ") : "none"} />
                {geoDiag.lastEvent ? (
                  <>
                    <DiagRow label="last_event" value={geoDiag.lastEvent.eventType +
                      (geoDiag.lastEvent.simulated ? " (simulated)" : "")} />
                    <DiagRow label="event_ts" value={geoDiag.lastEvent.timestamp} />
                    <DiagRow label="notif_sent" value={String(geoDiag.lastEvent.notificationSent)} />
                    {geoDiag.lastEvent.note ? (
                      <DiagRow label="note" value={geoDiag.lastEvent.note} />
                    ) : null}
                  </>
                ) : (
                  <DiagRow label="last_event" value="none" />
                )}
                {geoDiag.lastNotificationAt ? (
                  <DiagRow label="last_notif" value={geoDiag.lastNotificationAt} />
                ) : null}
                {(!geoDiag.geofenceRegistered || geoDiag.backgroundPermission !== "granted") ? (
                  <Pressable
                    style={diagStyles.settingsBtn}
                    onPress={() => Linking.openSettings()}
                  >
                    <Text style={diagStyles.settingsBtnText}>Open iPhone Settings →</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {/* ── Link Diagnostics ─────────────────────────────────────────── */}
            <View style={styles.sep} />
            <Row
              testID="dev-link-diagnostics"
              label={linkDiagLoading ? "Checking link…" : "Link diagnostics"}
              onPress={handleLinkDiagnostics}
            />
            {linkDiag ? (
              <View style={diagStyles.block}>
                <View style={diagStyles.titleRow}>
                  <Text style={diagStyles.title}>Link Diagnostics</Text>
                  {linkDiagLoading ? (
                    <ActivityIndicator size="small" color="#888" />
                  ) : null}
                </View>
                <DiagRow label="url" value={linkDiag.url} />
                <DiagRow label="path" value={linkDiag.path} />
                <DiagRow label="text" value={linkDiag.text ?? "none"} />
                <DiagRow label="opened_qa" value={String(linkDiag.openedQuickAdd)} />
                <DiagRow label="timestamp" value={linkDiag.timestamp} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Toast message={toast} visible={!!toast} testID="settings-toast" />

      <BottomSheet
        visible={sheet === "notifications"}
        onClose={() => setSheet(null)}
      >
        <PermissionExplanation
          testID="notification-permission"
          title="Get reminded before it's too late"
          body="CarryCue can notify you before or as you leave, so you remember what to bring."
          primaryLabel="Remind me"
          onPrimary={() => {
            setNotificationsEnabled(true);
            setSheet("ok");
          }}
          onDismiss={() => setSheet(null)}
        />
      </BottomSheet>

      <BottomSheet
        visible={sheet === "location"}
        onClose={() => {
          setSheet(null);
          // Reset to explain on close so reopening is always fresh
          // (unless home is already set, then 'manage' is the natural state).
          setLocationSubState(homeIsSet ? "manage" : "explain");
        }}
        testID="location-sheet"
      >
        {/* State: explain — CarryCue explanation before requesting permission */}
        {locationSubState === "explain" ? (
          <PermissionExplanation
            testID="location-permission"
            title="Remind you as you leave"
            body="CarryCue uses your location to know when you're leaving home and trigger your reminder."
            note="Your location is used only to trigger your reminder."
            primaryLabel="Use current location"
            onPrimary={handleUseCurrentLocation}
            onDismiss={() => setSheet(null)}
          />
        ) : null}

        {/* State: requesting — waiting for OS permission dialog / GPS fix */}
        {locationSubState === "requesting" ? (
          <View style={styles.requestingState}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.requestingText}>Getting your location…</Text>
          </View>
        ) : null}

        {/* State: success — both permissions granted, Home set, geofence registered */}
        {locationSubState === "success" ? (
          <View style={styles.okSheet} testID="location-success-sheet">
            <View style={styles.okIcon}>
              <Ionicons name="checkmark" size={30} color={colors.accent} />
            </View>
            <Text style={styles.okTitle}>Home location set</Text>
            <Text style={styles.okBody}>
              CarryCue will remind you when you leave home.
            </Text>
            <View style={styles.okButton}>
              <PrimaryButton
                title="Done"
                onPress={() => setSheet(null)}
                testID="location-success-done"
              />
            </View>
          </View>
        ) : null}

        {/* State: foreground-only — location saved but background access needed */}
        {locationSubState === "foreground-only" ? (
          <View style={styles.okSheet} testID="location-foreground-only-sheet">
            <Ionicons name="location-outline" size={40} color={colors.accent} />
            <Text style={[styles.okTitle, { marginTop: spacing.md }]}>Location saved</Text>
            <Text style={styles.okBody}>
              To receive reminders when CarryCue is closed, enable{" "}
              <Text style={{ fontWeight: font.semibold }}>Always</Text> location access in
              iPhone Settings → CarryCue → Location.
            </Text>
            <View style={[styles.okButton, { gap: spacing.sm }]}>
              <PrimaryButton
                title="Open iPhone Settings"
                onPress={() => { setSheet(null); Linking.openSettings(); }}
                testID="location-open-settings"
              />
              <TextButton
                title="Later"
                color={colors.textSecondary}
                onPress={() => setSheet(null)}
                testID="location-later"
              />
            </View>
          </View>
        ) : null}

        {/* State: blocked — permanently denied, must open Settings manually */}
        {locationSubState === "blocked" ? (
          <PermissionExplanation
            testID="location-blocked"
            title="Location access needed"
            body="CarryCue needs location access to detect when you leave home. Enable it in iPhone Settings."
            note="Settings → CarryCue → Location → Always"
            primaryLabel="Open iPhone Settings"
            onPrimary={() => { setSheet(null); Linking.openSettings(); }}
            onDismiss={() => setSheet(null)}
          />
        ) : null}

        {/* State: manage — home is already set, show change/remove options */}
        {locationSubState === "manage" ? (
          <View testID="location-manage-sheet">
            <Text style={styles.manageTitle}>Home location</Text>
            <View style={styles.manageCard}>
              <Ionicons name="location" size={18} color={colors.accent} />
              <Text style={styles.manageCardText}>Location set</Text>
            </View>
            <PrimaryButton
              title="Use current location"
              onPress={() => setLocationSubState("explain")}
              testID="change-home-location"
            />
            <View style={{ marginTop: spacing.sm, alignItems: "center" }}>
              <TextButton
                title="Remove home location"
                color="#EF4444"
                onPress={handleRemoveHomeLocation}
                testID="remove-home-location"
              />
            </View>
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={sheet === "ok"} onClose={() => setSheet(null)}>
        <View style={styles.okSheet} testID="permission-ok-sheet">
          <View style={styles.okIcon}>
            <Ionicons name="checkmark" size={30} color={colors.accent} />
          </View>
          <Text style={styles.okTitle}>You&apos;re all set</Text>
          <Text style={styles.okBody}>
            We&apos;ll remind you at the right moment.
          </Text>
          <View style={styles.okButton}>
            <PrimaryButton
              title="Done"
              onPress={() => setSheet(null)}
              testID="permission-ok-done"
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  pressed: {
    backgroundColor: colors.background,
  },
  rowLabel: {
    fontSize: type.checklistItem,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowAccent: {
    color: colors.accent,
    fontWeight: font.semibold,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md,
  },
  devHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  devRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  devChips: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  okSheet: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  okIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  okTitle: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  okBody: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  okButton: {
    alignSelf: "stretch",
    marginTop: spacing.lg,
  },
  // Location sheet: requesting state
  requestingState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  requestingText: {
    fontSize: type.secondary,
    color: colors.textSecondary,
  },
  // Location sheet: manage state
  manageTitle: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  manageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  manageCardText: {
    fontSize: type.secondary,
    color: colors.accent,
    fontWeight: font.semibold,
  },
});

// Separate StyleSheet for the diagnostic panel so it reads clearly.
const diagStyles = StyleSheet.create({
  block: {
    margin: spacing.md,
    marginTop: 0,
    padding: spacing.md,
    backgroundColor: "#111827",
    borderRadius: radius.sm,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  label: {
    fontSize: 12,
    color: "#6b7280",
    minWidth: 88,
    ...Platform.select({ ios: { fontFamily: "Menlo" }, android: { fontFamily: "monospace" } }),
  },
  value: {
    fontSize: 12,
    color: "#e5e7eb",
    flex: 1,
    flexWrap: "wrap",
    ...Platform.select({ ios: { fontFamily: "Menlo" }, android: { fontFamily: "monospace" } }),
  },
  valueError: {
    color: "#f87171",
  },
  settingsBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: "#1f2937",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  settingsBtnText: {
    fontSize: 13,
    color: "#60a5fa",
    fontWeight: "600" as const,
  },
});
