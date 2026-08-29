import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, font, spacing, type } from "@/src/theme";

export function ScreenHeader({
  title,
  showBack,
  rightIcon,
  onRightPress,
  rightTestID,
}: {
  title: string;
  showBack?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  rightTestID?: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {showBack ? (
          <Pressable
            testID="header-back-button"
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.sideRight]}>
        {rightIcon ? (
          <Pressable
            testID={rightTestID}
            onPress={onRightPress}
            hitSlop={10}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Ionicons name={rightIcon} size={24} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    height: 52,
  },
  side: {
    width: 44,
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    fontSize: type.navTitle,
    fontWeight: font.bold,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.5,
  },
});
