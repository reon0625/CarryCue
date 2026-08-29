import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "@/src/components/BottomSheet";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { TextButton } from "@/src/components/TextButton";
import { UPGRADE_COPY, UpgradeReason } from "@/src/data/limits";
import { colors, font, spacing, type } from "@/src/theme";

// Mock paywall entry point — CarryCue Free hit a Pro limit. No purchases or
// RevenueCat here yet; "Upgrade to Pro" is a placeholder for the real
// paywall that will replace this in a later step.
export function UpgradeSheet({
  visible,
  reason,
  onClose,
  onUpgrade,
  testID = "upgrade-sheet",
}: {
  visible: boolean;
  reason: UpgradeReason;
  onClose: () => void;
  onUpgrade?: () => void;
  testID?: string;
}) {
  const copy = UPGRADE_COPY[reason];

  return (
    <BottomSheet visible={visible} onClose={onClose} testID={testID}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <View style={styles.primary}>
          <PrimaryButton
            title="Upgrade to Pro"
            onPress={onUpgrade ?? onClose}
            testID={`${testID}-upgrade`}
          />
        </View>
        <View style={styles.secondary}>
          <TextButton
            title="Not now"
            color={colors.textSecondary}
            onPress={onClose}
            testID={`${testID}-dismiss`}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: type.contextTitle + 1,
    fontWeight: font.bold,
    color: colors.textPrimary,
  },
  body: {
    fontSize: type.secondary + 1,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  primary: {
    marginTop: spacing.lg,
  },
  secondary: {
    alignItems: "center",
    marginTop: spacing.xs,
  },
});
