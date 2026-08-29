import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { NotificationResponse } from "expo-notifications";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { addResponseListener, ensureAndroidChannel, getLaunchResponse, registerForegroundHandler } from "@/src/services/notifications";

// Import geofencing module at module level so TaskManager.defineTask is
// called before any component renders — required by Expo TaskManager.
// Must come AFTER the notification handler registration above, but before
// any component mounts.
import "@/src/services/geofencing";
import { StoreProvider } from "@/src/state/store";
import { colors } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// MUST be at module level — before any component renders — so that iOS
// has a handler registered the instant a foreground notification arrives.
// Belt-and-suspenders: also called from notifications.ts service on import,
// but explicit module-level registration here is the authoritative call.
registerForegroundHandler();

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const handledResponseIds = useRef(new Set<string>());

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Step 3A: every CarryCue notification routes to the same place — Home /
  // Before You Go — there's no per-notification details screen. Covers
  // cold start (tapped while the app was terminated), background, and the
  // (rare) case of tapping while already in the foreground.
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureAndroidChannel();

    const handleResponse = (response: NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handledResponseIds.current.has(id)) return;
      handledResponseIds.current.add(id);
      router.replace("/home");
    };

    getLaunchResponse().then((response) => {
      if (response) handleResponse(response);
    });

    const subscription = addResponseListener(handleResponse);
    return () => subscription.remove();
  }, []);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <StoreProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="home" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="routines/index" />
              <Stack.Screen name="routines/[id]" />
              <Stack.Screen
                name="trigger"
                options={{ presentation: "modal" }}
              />
              <Stack.Screen
                name="forgot"
                options={{ presentation: "modal" }}
              />
            </Stack>
          </StoreProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
