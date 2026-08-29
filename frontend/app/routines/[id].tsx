import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/src/components/BottomSheet";
import { ChecklistItem } from "@/src/components/ChecklistItem";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { TextButton } from "@/src/components/TextButton";
import { UpgradeSheet } from "@/src/components/UpgradeSheet";
import { useStore } from "@/src/state/store";
import { colors, font, spacing, type } from "@/src/theme";

export default function RoutineDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getRoutine,
    toggleRoutineItem,
    removeRoutineItem,
    addRoutineItem,
    renameRoutine,
    applyRoutine,
    deleteRoutine,
  } = useStore();

  const routine = getRoutine(id);

  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [itemText, setItemText] = useState("");
  const [nameText, setNameText] = useState(routine?.name ?? "");
  const addRef = useRef<TextInput>(null);
  const renameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (addOpen) {
      setItemText("");
      const t = setTimeout(() => addRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [addOpen]);

  useEffect(() => {
    if (renameOpen && routine) {
      setNameText(routine.name);
      const t = setTimeout(() => renameRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [renameOpen, routine]);

  if (!routine) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Routine" showBack />
        <Text style={styles.missing}>Routine not found.</Text>
      </View>
    );
  }

  const saveItem = () => {
    if (!itemText.trim()) return;
    addRoutineItem(routine.id, itemText);
    setAddOpen(false);
  };

  const saveName = () => {
    if (!nameText.trim()) return;
    renameRoutine(routine.id, nameText);
    setRenameOpen(false);
  };

  const useRoutine = () => {
    const result = applyRoutine(routine.id);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (result.limited) {
      setUpgradeVisible(true);
      return;
    }
    router.dismissTo("/home");
  };

  const handleDeleteRoutine = () => {
    deleteRoutine(routine.id);
    router.dismissTo("/routines");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title=""
        showBack
        rightIcon="trash-outline"
        rightTestID="routine-delete-button"
        onRightPress={handleDeleteRoutine}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          testID="routine-title"
          onPress={() => setRenameOpen(true)}
          style={styles.titleRow}
        >
          <Text style={styles.title}>{routine.name}</Text>
          <Text style={styles.rename}>Rename</Text>
        </Pressable>

        <View style={styles.list}>
          {routine.items.map((item) => (
            <ChecklistItem
              key={item.id}
              testID={`routine-item-${item.name}`}
              name={item.name}
              done={item.completed}
              onToggle={() => toggleRoutineItem(routine.id, item.id)}
              onDelete={() => removeRoutineItem(routine.id, item.id)}
            />
          ))}
        </View>

        <TextButton
          testID="routine-add-item"
          title="Add item"
          icon="add"
          onPress={() => setAddOpen(true)}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          title="Use this routine"
          onPress={useRoutine}
          testID="use-routine-button"
        />
      </View>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <Text style={styles.sheetTitle}>Add item</Text>
        <TextInput
          ref={addRef}
          testID="routine-item-input"
          value={itemText}
          onChangeText={setItemText}
          placeholder="Item name"
          placeholderTextColor={colors.disabled}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={saveItem}
        />
        <View style={styles.sheetButton}>
          <PrimaryButton
            title="Add"
            onPress={saveItem}
            disabled={!itemText.trim()}
            testID="routine-item-save"
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={renameOpen} onClose={() => setRenameOpen(false)}>
        <Text style={styles.sheetTitle}>Rename routine</Text>
        <TextInput
          ref={renameRef}
          testID="routine-rename-input"
          value={nameText}
          onChangeText={setNameText}
          placeholder="Routine name"
          placeholderTextColor={colors.disabled}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={saveName}
        />
        <View style={styles.sheetButton}>
          <PrimaryButton
            title="Save"
            onPress={saveName}
            disabled={!nameText.trim()}
            testID="routine-rename-save"
          />
        </View>
      </BottomSheet>

      <UpgradeSheet
        visible={upgradeVisible}
        reason="items"
        onClose={() => {
          setUpgradeVisible(false);
          router.dismissTo("/home");
        }}
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
    paddingBottom: spacing.xl,
  },
  missing: {
    padding: spacing.lg,
    color: colors.textSecondary,
    fontSize: type.checklistItem,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: font.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  rename: {
    fontSize: type.secondary,
    fontWeight: font.semibold,
    color: colors.accent,
    paddingBottom: 4,
  },
  list: {
    marginBottom: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  sheetTitle: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  input: {
    fontSize: 20,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetButton: {
    marginTop: spacing.lg,
  },
});
