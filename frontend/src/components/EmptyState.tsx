import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { colors, font, spacing, type } from "@/src/theme";

export function EmptyState({
  onAdd,
  testID,
}: {
  onAdd: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>Nothing to remember yet.</Text>
      <Text style={styles.body}>
        Add something now and we&apos;ll remind you when you leave.
      </Text>
      <View style={styles.button}>
        <PrimaryButton
          title="Add something"
          onPress={onAdd}
          testID="empty-add-button"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.xl,
    alignItems: "flex-start",
  },
  title: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  body: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  button: {
    marginTop: spacing.lg,
    alignSelf: "stretch",
  },
});
