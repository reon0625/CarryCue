import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, font, type } from "@/src/theme";

export function TriggerRow({
  label,
  subtitle,
  selected,
  onPress,
  testID,
}: {
  label: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? (
          <Ionicons name="checkmark" size={15} color="#FFFFFF" />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  textWrap: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    fontSize: type.checklistItem,
    color: colors.textPrimary,
    fontWeight: font.regular,
  },
  subtitle: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.8,
    borderColor: colors.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
