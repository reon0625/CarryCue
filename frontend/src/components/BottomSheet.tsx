import React, { useEffect, useRef, useState } from "react";
import {
  Animated as CoreAnimated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import RNAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing } from "@/src/theme";

const OFFSCREEN = 800;

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
};

// ---------------------------------------------------------------------------
// Native (iOS / Android): unchanged Reanimated + keyboard-controller sheet.
// ---------------------------------------------------------------------------
function NativeBottomSheet({ visible, onClose, children, testID }: SheetProps) {
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
    // The Reanimated keyboard height is negative on iOS. Negating it keeps
    // the panel immediately above the keyboard instead of moving behind it.
    // Android retains its existing resize-mode behavior.
    marginBottom: Platform.OS === "ios" ? -kb.value : kb.value,
  }));

  if (!mounted) return null;

  const panelRadius = radius.lg;

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <AnimatedPressable
        testID={testID ? `${testID}-backdrop` : "sheet-backdrop"}
        onPress={onClose}
        style={[styles.backdrop, backdropStyle]}
      />
      <View style={styles.anchor}>
        <RNAnimated.View
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
        </RNAnimated.View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Web: a plain, dependency-free bottom sheet.
//
// This intentionally does NOT use React Native's <Modal>, Reanimated, or
// react-native-keyboard-controller. Those are built around native
// modules/portals whose web shims behave inconsistently across mobile
// browser engines — on real mobile Safari the sheet could end up
// positioned off-screen or invisible even though its `visible` state was
// correctly `true`. A plain CSS `position: fixed` overlay, animated with
// React Native's core `Animated` API (not Reanimated), is the most
// predictable way to guarantee the sheet is visible on any web browser.
// ---------------------------------------------------------------------------
function WebBottomSheet({ visible, onClose, children, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new CoreAnimated.Value(OFFSCREEN)).current;
  const opacity = useRef(new CoreAnimated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      CoreAnimated.parallel([
        CoreAnimated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: false,
        }),
        CoreAnimated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      CoreAnimated.parallel([
        CoreAnimated.timing(translateY, {
          toValue: OFFSCREEN,
          duration: 180,
          useNativeDriver: false,
        }),
        CoreAnimated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, translateY, opacity]);

  if (!mounted) return null;

  return (
    <View style={webStyles.root} testID={testID}>
      <CoreAnimated.View
        style={[webStyles.backdrop, { opacity }]}
        // @ts-ignore — web-only pointer handler, harmless no-op on native
        onPointerDown={onClose}
      >
        <Pressable
          testID={testID ? `${testID}-backdrop` : "sheet-backdrop"}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
      </CoreAnimated.View>
      <CoreAnimated.View
        style={[
          webStyles.panel,
          {
            paddingBottom: insets.bottom + spacing.md,
            transform: [{ translateY }],
          },
        ]}
      >
        {children}
      </CoreAnimated.View>
    </View>
  );
}

export function BottomSheet(props: SheetProps) {
  return Platform.OS === "web" ? (
    <WebBottomSheet {...props} />
  ) : (
    <NativeBottomSheet {...props} />
  );
}

const AnimatedPressable = RNAnimated.createAnimatedComponent(Pressable);

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

const webStyles = StyleSheet.create({
  root: {
    position: "fixed" as "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  backdrop: {
    position: "fixed" as "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.backdrop,
  },
  panel: {
    position: "fixed" as "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: "85%",
    overflow: "scroll",
  },
});
