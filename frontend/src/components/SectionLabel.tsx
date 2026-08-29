import React from "react";
import { StyleSheet, Text, TextStyle } from "react-native";

import { colors, font, type } from "@/src/theme";

export function SectionLabel({
  children,
  style,
  testID,
}: {
  children: string;
  style?: TextStyle;
  testID?: string;
}) {
  return (
    <Text style={[styles.label, style]} testID={testID}>
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: type.sectionLabel,
    fontWeight: font.medium,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
});
