// Quick Add Shortcuts — Step 4B system-launch setup + testable entry point.
// Opened from Settings → Quick Add shortcuts.

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { storePendingQuickAdd } from "@/src/services/linkHandling";
import { colors, font, radius, spacing, type } from "@/src/theme";

// ── Step component ────────────────────────────────────────────────────────────

function Step({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View style={styles.step}>
      <Ionicons name={icon} size={18} color={colors.accent} style={styles.stepIcon} />
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function Shortcuts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Test Quick Add — stores a pending intent then navigates to Home.
  // router.navigate goes back to the existing Home entry in the stack
  // (pops Settings + Shortcuts on top of it).
  const handleTestQuickAdd = async () => {
    if (!__DEV__) return;
    await storePendingQuickAdd(null);
    router.navigate("/home");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Quick Add shortcuts" showBack />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero card ──────────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.iconBubble}>
              <Ionicons name="add-circle" size={26} color={colors.accent} />
            </View>
            <Text style={styles.heroTitle}>Quick Add</Text>
          </View>
          <Text style={styles.heroBody}>
            Add something to CarryCue without navigating through the app.
          </Text>
        </View>

        {/* ── Platform instructions ──────────────────────────────────────── */}
        {Platform.OS !== "android" ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Apple Shortcuts</Text>
              <Step
                icon="add-circle-outline"
                text="In Shortcuts, tap + and name it ‘CarryCue Quick Add’."
              />
              <RowDivider />
              <Step
                icon="link-outline"
                text="Add a ‘URL’ action and enter carrycue://add."
              />
              <RowDivider />
              <Step
                icon="arrow-forward-circle-outline"
                text="Add ‘Open URLs’, tap Done, then run it once to test."
              />
              <Text style={styles.sectionNote}>
                To start with text, use carrycue://add?text=Passport instead. Quick Add will still wait for you to save.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Action Button</Text>
              <Step
                icon="phone-portrait-outline"
                text="Open iPhone Settings → Action Button."
              />
              <RowDivider />
              <Step
                icon="flash-outline"
                text="Choose Shortcut, then select ‘CarryCue Quick Add’."
              />
              <Text style={styles.sectionNote}>
                Press and hold the Action Button to open Quick Add.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Lock Screen</Text>
              <Step
                icon="lock-closed-outline"
                text="Touch and hold the Lock Screen, then tap Customize → Lock Screen."
              />
              <RowDivider />
              <Step
                icon="options-outline"
                text="Replace a bottom control, choose Shortcut, then select ‘CarryCue Quick Add’."
              />
              <Text style={styles.sectionNote}>
                Available on supported iOS versions through Apple’s Shortcuts control.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Android</Text>
            <Step
              icon="apps-outline"
              text="Long-press the CarryCue icon on your launcher for a Quick Add shortcut"
            />
            <Text style={styles.sectionNote}>
              Use carrycue://add in any app that supports URL schemes.
            </Text>
          </View>
        )}

        {/* ── URL reference chips ────────────────────────────────────────── */}
        <View style={styles.urlBlock}>
          <UrlChip url="carrycue://add" />
          <UrlChip url="carrycue://add?text=Passport" />
        </View>

        {/* ── Development-only shortcut test ─────────────────────────────── */}
        {__DEV__ ? (
          <View style={styles.testBlock}>
            <PrimaryButton
              title="Test Quick Add"
              testID="test-quick-add-button"
              onPress={handleTestQuickAdd}
            />
            <Text style={styles.testHint}>
              Opens Quick Add exactly as a shortcut would.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function UrlChip({ url }: { url: string }) {
  return (
    <View style={styles.urlChip}>
      <Ionicons name="link-outline" size={14} color={colors.accent} />
      <Text style={styles.urlChipText} selectable>
        {url}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  heroBody: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    lineHeight: 22,
  },

  // Steps section
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  sectionLabel: {
    fontSize: type.sectionLabel,
    fontWeight: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  stepIcon: {
    marginTop: 2,
  },
  stepText: {
    fontSize: type.secondary,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md,
  },
  sectionNote: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },

  // URL chips
  urlBlock: {
    gap: spacing.sm,
  },
  urlChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: "flex-start",
  },
  urlChipText: {
    fontSize: 13,
    color: colors.accent,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },

  // Test button
  testBlock: {
    gap: spacing.sm,
  },
  testHint: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
