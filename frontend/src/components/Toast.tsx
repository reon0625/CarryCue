import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, font, radius, spacing, type } from "@/src/theme";

// Subtle, calm inline confirmation — neutral palette.
// When `onUndo` is provided the toast becomes interactive (row with Undo).
export function Toast({
  message,
  visible,
  testID,
  onUndo,
}: {
  message: string;
  visible: boolean;
  testID?: string;
  onUndo?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
  }, [visible, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!message) return null;

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.wrap,
        { bottom: insets.bottom + spacing.lg, pointerEvents: onUndo ? "box-none" : "none" },
        style,
      ]}
    >
      <Text style={styles.text}>{message}</Text>
      {onUndo ? (
        <>
          <Text style={styles.separator}>·</Text>
          <Pressable onPress={onUndo} hitSlop={10} testID={testID ? `${testID}-undo` : undefined}>
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  text: {
    color: "#FFFFFF",
    fontSize: type.secondary,
    fontWeight: font.medium,
  },
  separator: {
    color: "rgba(255,255,255,0.4)",
    fontSize: type.secondary,
  },
  undoText: {
    color: colors.accent,
    fontSize: type.secondary,
    fontWeight: font.semibold,
  },
});
