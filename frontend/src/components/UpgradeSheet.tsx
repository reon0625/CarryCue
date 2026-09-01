import React from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "@/src/components/BottomSheet";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { TextButton } from "@/src/components/TextButton";
import { UPGRADE_COPY, UpgradeReason } from "@/src/data/limits";
import { useRevenueCat } from "@/src/services/revenueCat";
import { colors, font, spacing, type } from "@/src/theme";

export function UpgradeSheet({
  visible,
  reason,
  onClose,
  testID = "upgrade-sheet",
}: {
  visible: boolean;
  reason: UpgradeReason;
  onClose: () => void;
  testID?: string;
}) {
  const copy = UPGRADE_COPY[reason];
  const { busy, presentPaywall } = useRevenueCat();

  const handleUpgrade = async () => {
    // Let the explanatory sheet finish closing before RevenueCat presents its
    // native, remotely configured paywall.
    onClose();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = await presentPaywall();
    if (result.status === "error" || result.status === "unavailable") {
      Alert.alert("Purchases unavailable", result.message);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} testID={testID}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <View style={styles.primary}>
          <PrimaryButton
            title="Upgrade to Pro"
            onPress={handleUpgrade}
            loading={busy}
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
