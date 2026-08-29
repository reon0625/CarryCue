import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, font, type } from "@/src/theme";

export function TextButton({
  title,
  onPress,
  icon,
  color = colors.accent,
  testID,
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={20} color={color} /> : null}
      <Text style={[styles.text, { color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.6,
  },
  text: {
    fontSize: type.button,
    fontWeight: font.semibold,
  },
});
