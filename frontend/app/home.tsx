import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChecklistItem } from "@/src/components/ChecklistItem";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { QuickAddSheet } from "@/src/components/QuickAddSheet";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionLabel } from "@/src/components/SectionLabel";
import { TextButton } from "@/src/components/TextButton";
import { useStore } from "@/src/state/store";
import { colors, font, spacing, type } from "@/src/theme";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, frequentlyUsed, leaveTime, toggleItem, addItem } = useStore();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const sorted = useMemo(() => {
    const incomplete = items.filter((i) => !i.done);
    const complete = items.filter((i) => i.done);
    return [...incomplete, ...complete];
  }, [items]);

  const remaining = items.filter((i) => !i.done).length;
  const allDone = items.length > 0 && remaining === 0;
  const isEmpty = items.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="CarryCue"
        rightIcon="settings-outline"
        rightTestID="settings-button"
        onRightPress={() => router.push("/settings")}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel testID="before-you-go-label">Before you go</SectionLabel>

        {isEmpty ? (
          <EmptyState
            testID="empty-state"
            onAdd={() => setQuickAddOpen(true)}
          />
        ) : (
          <>
            {allDone ? (
              <View style={styles.allSet} testID="all-set-state">
                <View style={styles.allSetRow}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                  <Text style={styles.allSetTitle}>All set</Text>
                </View>
                <Text style={styles.allSetBody}>You&apos;re good to go.</Text>
              </View>
            ) : (
              <View style={styles.context}>
                <Text style={styles.contextTitle}>Leaving around {leaveTime}</Text>
                <Text style={styles.contextSub}>
                  {remaining} {remaining === 1 ? "thing" : "things"}
                </Text>
              </View>
            )}

            <View style={styles.list}>
              {sorted.map((item) => (
                <ChecklistItem
                  key={item.id}
                  testID={`checklist-item-${item.name}`}
                  name={item.name}
                  done={item.done}
                  onToggle={() => toggleItem(item.id)}
                />
              ))}
            </View>

            <TextButton
              testID="add-something-button"
              title="Add something"
              icon="add"
              onPress={() => setQuickAddOpen(true)}
            />

            <View style={styles.frequentSection}>
              <SectionLabel>Frequently used</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {frequentlyUsed.slice(0, 5).map((f) => (
                  <Chip
                    key={f}
                    testID={`frequent-chip-${f}`}
                    label={f}
                    onPress={() => addItem(f)}
                  />
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  context: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  contextTitle: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  contextSub: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: 2,
  },
  allSet: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  allSetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  allSetTitle: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  allSetBody: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: 2,
  },
  list: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  frequentSection: {
    marginTop: spacing.xl,
  },
  chips: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingRight: spacing.md,
  },
});
