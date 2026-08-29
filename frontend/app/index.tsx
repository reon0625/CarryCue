import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useStore } from "@/src/state/store";
import { colors } from "@/src/theme";

export default function Index() {
  const { hydrated, hasLaunched } = useStore();

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={hasLaunched ? "/home" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
