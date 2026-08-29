import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, font, radius, spacing, type } from "@/src/theme";

// Subtle, calm inline confirmation — no colors beyond the neutral palette.
export function Toast({
  message,
  visible,
  testID,
}: {
  message: string;
  visible: boolean;
  testID?: string;
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
        { bottom: insets.bottom + spacing.lg, pointerEvents: "none" },
        style,
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignSelf: "center",
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
});
