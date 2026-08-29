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
  reminderLabel,
  onReminderPress,
  testID,
}: {
  name: string;
  done: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  // Step 3A: when set, shows a small filled alarm icon + the scheduled time
  // under the item name (a live "time" reminder is attached to it).
  reminderLabel?: string | null;
  // Opens Trigger Setup for this item so its reminder can be set/changed.
  onReminderPress?: () => void;
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
          {done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.label, done && styles.labelDone]} numberOfLines={1}>
            {name}
          </Text>
          {reminderLabel ? (
            <Text style={styles.reminderText} numberOfLines={1}>
              {reminderLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {onReminderPress ? (
        <Pressable
          testID={testID ? `${testID}-reminder` : undefined}
          onPress={onReminderPress}
          hitSlop={8}
          style={({ pressed }) => [styles.reminderButton, pressed && styles.pressed]}
        >
          <Ionicons
            name={reminderLabel ? "alarm" : "alarm-outline"}
            size={19}
            color={reminderLabel ? colors.accent : colors.disabled}
          />
        </Pressable>
      ) : null}
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
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 7,
  },
  pressed: {
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.6,
    borderColor: colors.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: type.checklistItem,
    fontWeight: font.medium,
    color: colors.textPrimary,
  },
  labelDone: {
    color: colors.textSecondary,
    fontWeight: font.regular,
  },
  reminderText: {
    fontSize: type.secondary - 1.5,
    color: colors.accent,
    marginTop: 1,
  },
  reminderButton: {
    padding: 8,
  },
  delete: {
    padding: 8,
  },
});
