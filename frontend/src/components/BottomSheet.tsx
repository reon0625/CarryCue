import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";

const OFFSCREEN = 800;

export function BottomSheet({
  visible,
  onClose,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: kb } = useReanimatedKeyboardAnimation();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 260 });
    } else {
      progress.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress]);

  useEffect(() => {
    if (Platform.OS !== "android" || !mounted) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [mounted, onClose]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * OFFSCREEN }],
    marginBottom: kb.value,
  }));

  if (!mounted) return null;

  // Platform-native feel: iOS uses a rounded top with a grabber,
  // Android uses a Material-style modal bottom sheet.
  const panelRadius = Platform.OS === "ios" ? radius.lg : radius.lg;

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <AnimatedPressable
        testID={testID ? `${testID}-backdrop` : "sheet-backdrop"}
        onPress={onClose}
        style={[styles.backdrop, backdropStyle]}
      />
      <View style={styles.anchor}>
        <Animated.View
          style={[
            styles.panel,
            {
              borderTopLeftRadius: panelRadius,
              borderTopRightRadius: panelRadius,
              paddingBottom: insets.bottom + spacing.md,
            },
            panelStyle,
          ]}
        >
          {Platform.OS === "ios" ? <View style={styles.grabber} /> : null}
          {children}
        </Animated.View>
      </View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.backdrop,
  },
  anchor: {
    flex: 1,
    justifyContent: "flex-end",
    pointerEvents: "box-none",
  },
  panel: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
});
