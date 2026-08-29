import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChecklistItem } from "@/src/components/ChecklistItem";
import { Chip } from "@/src/components/Chip";
import { EmptyState } from "@/src/components/EmptyState";
import { QuickAddSheet } from "@/src/components/QuickAddSheet";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionLabel } from "@/src/components/SectionLabel";
import { TextButton } from "@/src/components/TextButton";
import { Toast } from "@/src/components/Toast";
import { UpgradeSheet } from "@/src/components/UpgradeSheet";
import { CarryItem } from "@/src/data/models";
import { useStore } from "@/src/state/store";
import { colors, font, radius, spacing, type } from "@/src/theme";
import { formatReminderLabel } from "@/src/utils/formatReminder";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, frequentlyUsed, leaveTime, toggleItem, addItem, removeItem, restoreItem } = useStore();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // undo state: the deleted item + its original index in the items array
  const [undoPayload, setUndoPayload] = useState<{ item: CarryItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    // Don't interrupt an active Undo toast with a plain flash
    if (undoPayload) return;
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }, [undoPayload]);

  const handleDelete = useCallback(
    (item: CarryItem) => {
      const index = items.findIndex((i) => i.id === item.id);
      removeItem(item.id);
      setUndoPayload({ item, index });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => {
        setUndoPayload(null);
      }, 3000);
    },
    [items, removeItem],
  );

  const handleUndo = useCallback(() => {
    if (!undoPayload) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    restoreItem(undoPayload.item, undoPayload.index);
    setUndoPayload(null);
  }, [undoPayload, restoreItem]);

  const addFromChip = useCallback(
    (name: string) => {
      const result = addItem(name, "frequentlyUsed");
      if (result.status === "duplicate") flash("Already on your list");
      else if (result.status === "limit") setUpgradeVisible(true);
    },
    [addItem, flash],
  );

  const sorted = useMemo(() => {
    const incomplete = items.filter((i) => !i.completed);
    const complete = items.filter((i) => i.completed);
    return [...incomplete, ...complete];
  }, [items]);

  const remaining = items.filter((i) => !i.completed).length;
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
                <Text style={styles.contextSub}>{remaining} left</Text>
              </View>
            )}

            <View style={styles.list}>
              {sorted.map((item) => {
                const onDelete = () => handleDelete(item);
                const onReminderPress = () =>
                  router.push({ pathname: "/trigger", params: { itemId: item.id } });
                const reminderLabel =
                  item.trigger.type === "time" && item.trigger.config?.time
                    ? formatReminderLabel(item.trigger.config.time)
                    : null;
                // Web: show inline delete button (swipe not available in browser)
                if (Platform.OS === "web") {
                  return (
                    <ChecklistItem
                      key={item.id}
                      testID={`checklist-item-${item.name}`}
                      name={item.name}
                      done={item.completed}
                      onToggle={() => toggleItem(item.id)}
                      onDelete={onDelete}
                      reminderLabel={reminderLabel}
                      onReminderPress={onReminderPress}
                    />
                  );
                }
                // iOS / Android: swipe left to reveal Delete
                return (
                  <Swipeable
                    key={item.id}
                    friction={2}
                    rightThreshold={60}
                    renderRightActions={() => (
                      <Pressable
                        style={styles.swipeDelete}
                        onPress={onDelete}
                        testID={`swipe-delete-${item.name}`}
                      >
                        <Text style={styles.swipeDeleteText}>Delete</Text>
                      </Pressable>
                    )}
                  >
                    <ChecklistItem
                      testID={`checklist-item-${item.name}`}
                      name={item.name}
                      done={item.completed}
                      onToggle={() => toggleItem(item.id)}
                      reminderLabel={reminderLabel}
                      onReminderPress={onReminderPress}
                    />
                  </Swipeable>
                );
              })}
            </View>

            <TextButton
              testID="add-something-button"
              title="Add something"
              icon="add"
              onPress={() => setQuickAddOpen(true)}
            />

            <View style={styles.frequentSection}>
              <SectionLabel>Suggestions</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {frequentlyUsed.map((f) => (
                  <Chip
                    key={f}
                    testID={`frequent-chip-${f}`}
                    label={f}
                    onPress={() => addFromChip(f)}
                  />
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      <Toast
        message={undoPayload ? "Item removed" : toast}
        visible={!!(undoPayload || toast)}
        testID="home-toast"
        onUndo={undoPayload ? handleUndo : undefined}
      />

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        frequentlyUsed={frequentlyUsed}
        onLimitReached={() => setUpgradeVisible(true)}
      />

      <UpgradeSheet
        visible={upgradeVisible}
        reason="items"
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  context: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  frequentSection: {
    marginTop: spacing.lg,
  },
  chips: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.md,
  },
  swipeDelete: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: radius.sm,
    marginVertical: 2,
    marginRight: 2,
  },
  swipeDeleteText: {
    color: "#FFFFFF",
    fontSize: type.secondary,
    fontWeight: font.semibold,
  },
});
