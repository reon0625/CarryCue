import React, { useEffect, useState } from "react";
import {
  BackHandler,
  Modal,
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
const IS_WEB = Platform.OS === "web";

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
  // On web the browser resizes the visual viewport itself when the
  // keyboard opens (and mobile Safari's implementation of this native
  // module is unreliable), so we never read `kb` there — see the IS_WEB
  // branch in panelStyle below.
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
    marginBottom: IS_WEB ? 0 : kb.value,
  }));

  if (!mounted) return null;

  // Platform-native feel: iOS uses a rounded top with a grabber,
  // Android uses a Material-style modal bottom sheet.
  const panelRadius = Platform.OS === "ios" ? radius.lg : radius.lg;

  const sheet = (
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

  // Web fallback: react-native-web's ScrollView installs its own touch
  // responder to detect scroll gestures, and a sheet rendered inline in
  // the tree can end up sharing that responder chain with an ancestor
  // ScrollView. In real mobile Safari (not the desktop/headless
  // emulation used during development) that can swallow the very tap
  // that opens the sheet, or leave it positioned behind other content.
  // RN's own <Modal> renders through a top-level portal outside of any
  // ScrollView, which sidesteps that responder conflict entirely and is
  // well supported by react-native-web.
  if (IS_WEB) {
    return (
      <Modal
        visible
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        {sheet}
      </Modal>
    );
  }

  return sheet;
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
