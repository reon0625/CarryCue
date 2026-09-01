// carrycue://add          → open Quick Add on Home
// carrycue://add?text=X   → open Quick Add with X pre-filled (does not auto-save)
//
// Expo Router maps the URL scheme's "add" path to this screen.
// The screen renders a brief loading state while the store hydrates,
// then stores a one-shot intent and navigates to Home so Quick Add opens there.
//
// Navigation strategy
// ───────────────────
// Cold start (stack = [add])     → router.replace('/home')  — nothing to go back to
// Warm start (stack = [home, add]) → router.replace('/home') — home is on top, Quick Add opens
//
// home.tsx picks up the intent via useFocusEffect + consumePendingQuickAdd.

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import {
  storePendingQuickAdd,
  writeLinkDiagnostics,
} from "@/src/services/linkHandling";
import { useStore } from "@/src/state/store";
import { colors } from "@/src/theme";

export default function AddRoute() {
  const router = useRouter();
  const { text } = useLocalSearchParams<{ text?: string }>();
  const { hydrated, hasLaunched } = useStore();

  useEffect(() => {
    if (!hydrated) return;

    const handle = async () => {
      const trimmed =
        typeof text === "string" && text.trim().length > 0 ? text.trim() : null;

      // Record diagnostics for the Settings dev panel (dev builds only).
      await writeLinkDiagnostics({
        url: `carrycue://add${trimmed ? `?text=${encodeURIComponent(trimmed)}` : ""}`,
        path: "add",
        text: trimmed,
        openedQuickAdd: hasLaunched,
        timestamp: new Date().toISOString(),
      });

      if (!hasLaunched) {
        // Onboarding not complete — go there instead, skip Quick Add.
        router.replace("/onboarding");
        return;
      }

      // Store one-shot intent; home.tsx consumes it when it gains focus.
      await storePendingQuickAdd(trimmed);

      // Replace this route so the blank loading screen is never in Back history.
      router.replace("/home");
    };

    handle();
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Blank orange-tinted loading screen — same background as the rest of the
  // app so there is no jarring colour flash during the redirect.
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
