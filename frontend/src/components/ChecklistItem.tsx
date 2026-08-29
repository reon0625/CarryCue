import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, font, type } from "@/src/theme";

export function ChecklistItem({
  name,
  done,
  onToggle,
  onDelete,
  testID,
}: {
  name: string;
  done: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  testID?: string;
}) {
  const handleToggle = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggle();
  };

  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        onPress={handleToggle}
        hitSlop={8}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, done && styles.checkboxDone]}>
          {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
        </View>
        <Text style={[styles.label, done && styles.labelDone]} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
      {onDelete ? (
        <Pressable
          testID={testID ? `${testID}-delete` : undefined}
          onPress={onDelete}
          hitSlop={8}
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={20} color={colors.disabled} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.8,
    borderColor: colors.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  label: {
    flex: 1,
    fontSize: type.checklistItem,
    fontWeight: font.regular,
    color: colors.textPrimary,
  },
  labelDone: {
    color: colors.disabled,
    textDecorationLine: "line-through",
  },
  delete: {
    padding: 8,
  },
});
