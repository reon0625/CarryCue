import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { colors, font, radius, spacing, type } from "@/src/theme";

const WEEKDAYS = [
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "T", value: 4 },
  { label: "F", value: 5 },
  { label: "S", value: 6 },
  { label: "S", value: 0 },
];

function dateForPrepareTime(value: string): Date {
  const [hour, minute] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hour || 0, minute || 0, 0, 0);
  return date;
}

function prepareTimeFromDate(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;
}

function prepareTimeLabel(value: string): string {
  return dateForPrepareTime(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

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
    setRoutineSchedule,
    applyRoutine,
    deleteRoutine,
  } = useStore();

  const routine = getRoutine(id);

  const [addOpen, setAddOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
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

  const toggleWeekday = (weekday: number) => {
    const selected = routine.schedule.weekdays.includes(weekday);
    setRoutineSchedule(routine.id, {
      weekdays: selected
        ? routine.schedule.weekdays.filter((day) => day !== weekday)
        : [...routine.schedule.weekdays, weekday],
    });
  };

  const setPrepareTime = (selected: Date | undefined) => {
    if (!selected) return;
    setRoutineSchedule(routine.id, {
      prepareTime: prepareTimeFromDate(selected),
    });
  };

  const openPrepareTime = () => {
    const value = dateForPrepareTime(routine.schedule.prepareTime);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "time",
        onChange: (_event, selected) => setPrepareTime(selected),
      });
      return;
    }
    if (Platform.OS === "ios") setTimePickerOpen(true);
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

        <View style={styles.scheduleSection}>
          <Text style={styles.sectionLabel}>Schedule</Text>
          <View style={styles.scheduleCard}>
            <View style={styles.scheduleToggleRow}>
              <Text style={styles.scheduleTitle}>Prepare automatically</Text>
              <Switch
                testID="routine-schedule-toggle"
                value={routine.schedule.enabled}
                onValueChange={(enabled) =>
                  setRoutineSchedule(routine.id, { enabled })
                }
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
              />
            </View>

            {routine.schedule.enabled ? (
              <View testID="routine-schedule-enabled">
                <View style={styles.scheduleDivider} />
                <Text style={styles.fieldLabel}>Days</Text>
                <View style={styles.weekdays}>
                  {WEEKDAYS.map((weekday, index) => {
                    const selected = routine.schedule.weekdays.includes(
                      weekday.value,
                    );
                    return (
                      <Pressable
                        key={`${weekday.value}-${index}`}
                        testID={`routine-weekday-${weekday.value}`}
                        onPress={() => toggleWeekday(weekday.value)}
                        style={({ pressed }) => [
                          styles.weekday,
                          selected && styles.weekdaySelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekdayText,
                            selected && styles.weekdayTextSelected,
                          ]}
                        >
                          {weekday.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  testID="routine-prepare-time"
                  onPress={openPrepareTime}
                  style={({ pressed }) => [
                    styles.prepareRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.prepareLabel}>Prepare at</Text>
                  <View style={styles.prepareValue}>
                    <Text style={styles.prepareTime}>
                      {prepareTimeLabel(routine.schedule.prepareTime)}
                    </Text>
                    {Platform.OS !== "web" ? (
                      <Ionicons
                        name="chevron-forward"
                        size={17}
                        color={colors.disabled}
                      />
                    ) : null}
                  </View>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
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

      <BottomSheet
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        testID="routine-time-picker-sheet"
      >
        <Text style={styles.sheetTitle}>Prepare at</Text>
        {Platform.OS === "ios" ? (
          <DateTimePicker
            testID="routine-time-picker"
            value={dateForPrepareTime(routine.schedule.prepareTime)}
            mode="time"
            display="spinner"
            onChange={(_event, selected) => setPrepareTime(selected)}
          />
        ) : null}
        <View style={styles.sheetButton}>
          <PrimaryButton
            title="Done"
            onPress={() => setTimePickerOpen(false)}
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
  pressed: {
    opacity: 0.6,
  },
  scheduleSection: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    fontSize: type.sectionLabel,
    fontWeight: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  scheduleToggleRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scheduleTitle: {
    fontSize: type.secondary + 1,
    fontWeight: font.medium,
    color: colors.textPrimary,
  },
  scheduleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  fieldLabel: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  weekdays: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  weekday: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 38,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  weekdaySelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: font.semibold,
    color: colors.textSecondary,
  },
  weekdayTextSelected: {
    color: colors.surface,
  },
  prepareRow: {
    minHeight: 54,
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prepareLabel: {
    fontSize: type.secondary + 1,
    color: colors.textPrimary,
  },
  prepareValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  prepareTime: {
    fontSize: type.secondary + 1,
    fontWeight: font.semibold,
    color: colors.accent,
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
