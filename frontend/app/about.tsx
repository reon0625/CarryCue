import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import React from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  PRIVACY_POLICY_URL,
  SUPPORT_URL,
  TERMS_OF_USE_URL,
} from "@/src/data/externalLinks";
import { colors, font, radius, spacing, type } from "@/src/theme";

async function openExternalLink(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Could not open link", "Please try again later.");
  }
}

function AboutRow({
  label,
  url,
  testID,
}: {
  label: string;
  url: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => void openExternalLink(url)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="open-outline" size={18} color={colors.disabled} />
    </Pressable>
  );
}

export default function About() {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? "Unknown";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="About" showBack />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.appName}>CarryCue</Text>
          <Text testID="about-version" style={styles.version}>
            Version {version}
          </Text>
          <Text style={styles.description}>
            CarryCue helps you remember what to bring before you leave.
          </Text>
        </View>

        <View style={styles.group}>
          <AboutRow
            testID="about-privacy"
            label="Privacy Policy"
            url={PRIVACY_POLICY_URL}
          />
          <View style={styles.separator} />
          <AboutRow
            testID="about-terms"
            label="Terms of Use"
            url={TERMS_OF_USE_URL}
          />
          <View style={styles.separator} />
          <AboutRow
            testID="about-support"
            label="Support / Contact"
            url={SUPPORT_URL}
          />
        </View>
      </ScrollView>
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
  intro: {
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xl,
  },
  appName: {
    fontSize: type.navTitle,
    fontWeight: font.bold,
    color: colors.textPrimary,
  },
  version: {
    marginTop: spacing.xs,
    fontSize: type.secondary,
    color: colors.textSecondary,
  },
  description: {
    marginTop: spacing.md,
    maxWidth: 320,
    fontSize: type.checklistItem,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: type.checklistItem,
    color: colors.textPrimary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md,
    backgroundColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.background,
  },
});
