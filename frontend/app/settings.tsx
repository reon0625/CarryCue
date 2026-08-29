import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/src/components/BottomSheet";
import { Chip } from "@/src/components/Chip";
import { PermissionExplanation } from "@/src/components/PermissionExplanation";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionLabel } from "@/src/components/SectionLabel";
import { Toast } from "@/src/components/Toast";
import { useStore } from "@/src/state/store";
import { colors, font, radius, spacing, type } from "@/src/theme";

type Sheet = null | "notifications" | "location" | "ok";

function Row({
  label,
  onPress,
  accent,
  testID,
}: {
  label: string;
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
      <Text style={[styles.rowLabel, accent && styles.rowAccent]}>{label}</Text>
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
  const { entitlement, setEntitlementDev, resetAllDataDev, setNotificationsEnabled } =
    useStore();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState("");
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
            testID="settings-home-location"
            label="Home location"
            onPress={() => setSheet("location")}
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
          <Row testID="settings-quick-add" label="Quick Add shortcuts" />
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
        onClose={() => setSheet(null)}
      >
        <PermissionExplanation
          testID="location-permission"
          title="Remind you as you leave"
          body="CarryCue uses your location to know when you're leaving home and trigger your reminder."
          note="Your location is used only to trigger your reminder."
          primaryLabel="Remind me when I leave"
          onPrimary={() => setSheet("ok")}
          onDismiss={() => setSheet(null)}
        />
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
});
