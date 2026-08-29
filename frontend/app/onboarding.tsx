import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useStore } from "@/src/state/store";
import { colors, font, spacing } from "@/src/theme";

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeLaunch } = useStore();

  const getStarted = () => {
    completeLaunch();
    router.replace("/home");
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg },
      ]}
    >
      <View style={styles.body}>
        <Text style={styles.brand}>CarryCue</Text>
        <Text style={styles.headline}>
          Remember what you need{"\n"}before you leave.
        </Text>
        <Text style={styles.tagline}>Never forget it twice.</Text>
      </View>
      <PrimaryButton
        title="Get started"
        onPress={getStarted}
        testID="get-started-button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    justifyContent: "space-between",
  },
  body: {
    flex: 1,
    justifyContent: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: font.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  headline: {
    fontSize: 22,
    fontWeight: font.medium,
    color: colors.textPrimary,
    lineHeight: 30,
  },
  tagline: {
    fontSize: 16,
    color: colors.accent,
    fontWeight: font.semibold,
    marginTop: spacing.md,
  },
});
