import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { TextButton } from "@/src/components/TextButton";
import { colors, font, spacing, type } from "@/src/theme";

export function PermissionExplanation({
  title,
  body,
  note,
  primaryLabel,
  onPrimary,
  onDismiss,
  testID,
}: {
  title: string;
  body: string;
  note?: string;
  primaryLabel: string;
  onPrimary: () => void;
  onDismiss: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.primary}>
        <PrimaryButton
          title={primaryLabel}
          onPress={onPrimary}
          testID={testID ? `${testID}-primary` : "permission-primary"}
        />
      </View>
      <View style={styles.secondary}>
        <TextButton
          title="Not now"
          color={colors.textSecondary}
          onPress={onDismiss}
          testID={testID ? `${testID}-dismiss` : "permission-dismiss"}
        />
      </View>
    </View>
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
  note: {
    fontSize: type.secondary,
    color: colors.disabled,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  primary: {
    marginTop: spacing.lg,
  },
  secondary: {
    alignItems: "center",
    marginTop: spacing.xs,
  },
});
