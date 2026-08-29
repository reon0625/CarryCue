import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { TextButton } from "@/src/components/TextButton";
import { UpgradeSheet } from "@/src/components/UpgradeSheet";
import { useStore } from "@/src/state/store";
import { colors, font, spacing, type } from "@/src/theme";

export default function Routines() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { routines, newRoutine, deleteRoutine } = useStore();
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const createRoutine = () => {
    const result = newRoutine();
    if (result.status === "limit") {
      setUpgradeVisible(true);
      return;
    }
    router.push({ pathname: "/routines/[id]", params: { id: result.id } });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Routines" showBack />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.group}>
          {routines.map((r, idx) => (
            <React.Fragment key={r.id}>
              {idx > 0 ? <View style={styles.sep} /> : null}
              <View style={styles.row}>
                <Pressable
                  testID={`routine-row-${r.name}`}
                  onPress={() =>
                    router.push({ pathname: "/routines/[id]", params: { id: r.id } })
                  }
                  style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{r.name}</Text>
                    <Text style={styles.items} numberOfLines={1}>
                      {r.items.map((i) => i.name).join(", ") || "No items yet"}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.disabled}
                  />
                </Pressable>
                <Pressable
                  testID={`routine-delete-${r.name}`}
                  onPress={() => deleteRoutine(r.id)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.disabled} />
                </Pressable>
              </View>
            </React.Fragment>
          ))}
        </View>

        <TextButton
          testID="new-routine-button"
          title="New routine"
          icon="add"
          onPress={createRoutine}
        />
      </ScrollView>

      <UpgradeSheet
        visible={upgradeVisible}
        reason="routines"
        onClose={() => setUpgradeVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  group: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  deleteButton: {
    padding: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  name: {
    fontSize: type.checklistItem,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  items: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: 3,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
