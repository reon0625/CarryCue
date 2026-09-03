import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/src/components/BottomSheet";
import { PermissionExplanation } from "@/src/components/PermissionExplanation";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { TextButton } from "@/src/components/TextButton";
import { Toast } from "@/src/components/Toast";
import { TriggerRow } from "@/src/components/TriggerRow";
import { UpgradeSheet } from "@/src/components/UpgradeSheet";
import { ItemSource, Trigger as TriggerConfig } from "@/src/data/models";
import { localDateKey } from "@/src/services/routineScheduling";
import {
  cancel,
  getPermissionStatus,
  isNotificationsAvailable,
  requestPermission,
  scheduleAt,
} from "@/src/services/notifications";
import { useStore } from "@/src/state/store";
import { colors, font, radius, spacing, type } from "@/src/theme";
import { formatReminderLabel } from "@/src/utils/formatReminder";

type TriggerType = "leaving" | "time" | "specificDay";
type TimeChoice = "Later today" | "Tomorrow morning" | "Choose date & time";

export default function Trigger() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    itemId?: string;
    planId?: string;
    draftName?: string;
    draftSource?: string;
  }>();
  const {
    locations,
    items,
    oneTimePlans,
    addItemWithTrigger,
    setItemTrigger,
    saveOneTimePlan,
    deleteOneTimePlan,
  } = useStore();

  // Step 3A: this screen either edits an already-persisted item (`itemId`)
  // or holds a Quick Add draft that is only ever persisted once a reminder
  // here is actually confirmed (see commitSchedule) — never before.
  const item = params.itemId ? items.find((i) => i.id === params.itemId) : undefined;
  const plan = params.planId
    ? oneTimePlans.find((candidate) => candidate.id === params.planId)
    : undefined;
  const isDraft = !params.itemId && !params.planId && !!params.draftName;
  const displayName = item?.name ?? plan?.name ?? params.draftName ?? "";

  const [type_, setType] = useState<TriggerType>(() => {
    if (item?.trigger.type === "time") return "time";
    if (plan) return "specificDay";
    return "leaving";
  });
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(() =>
    item?.trigger.type === "time" ? "Choose date & time" : "Later today",
  );
  const [customDate, setCustomDate] = useState<Date>(() =>
    item?.trigger.type === "time" && item.trigger.config?.time
      ? new Date(item.trigger.config.time)
      : dayjs().add(3, "hour").toDate(),
  );
  const [specificDate, setSpecificDate] = useState<Date>(() =>
    plan
      ? dayjs(`${plan.scheduledDate}T12:00:00`).toDate()
      : dayjs().add(1, "day").startOf("day").hour(12).toDate(),
  );
  const [prepareAtEnabled, setPrepareAtEnabled] = useState(
    () => plan?.prepareTime !== null && plan?.prepareTime !== undefined,
  );
  const [prepareAt, setPrepareAt] = useState<Date>(() => {
    const [hour, minute] = (plan?.prepareTime ?? "08:00").split(":").map(Number);
    return dayjs().hour(hour).minute(minute).second(0).millisecond(0).toDate();
  });
  const [itemLimitVisible, setItemLimitVisible] = useState(false);
  const [explainVisible, setExplainVisible] = useState(false);
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const home = locations[0];
  const homeIsSet = home?.latitude != null && home?.longitude != null;
  const hasExistingTimeTrigger = item?.trigger.type === "time";

  const resolveDate = (): Date => {
    if (timeChoice === "Later today") return dayjs().add(3, "hour").toDate();
    if (timeChoice === "Tomorrow morning")
      return dayjs().add(1, "day").hour(8).minute(0).second(0).millisecond(0).toDate();
    return customDate;
  };

  const previewDate = resolveDate();
  const isFutureChoice = previewDate.getTime() > Date.now();

  const openAndroidPicker = () => {
    DateTimePickerAndroid.open({
      value: customDate,
      mode: "date",
      minimumDate: new Date(),
      onChange: (_event, selectedDate) => {
        if (!selectedDate) return;
        const mergedDate = dayjs(customDate)
          .year(selectedDate.getFullYear())
          .month(selectedDate.getMonth())
          .date(selectedDate.getDate())
          .toDate();
        setCustomDate(mergedDate);
        DateTimePickerAndroid.open({
          value: mergedDate,
          mode: "time",
          onChange: (_e2, selectedTime) => {
            if (!selectedTime) return;
            setCustomDate(
              dayjs(mergedDate)
                .hour(selectedTime.getHours())
                .minute(selectedTime.getMinutes())
                .second(0)
                .millisecond(0)
                .toDate(),
            );
          },
        });
      },
    });
  };

  const openAndroidSpecificDatePicker = () => {
    DateTimePickerAndroid.open({
      value: specificDate,
      mode: "date",
      minimumDate: dayjs().startOf("day").toDate(),
      onChange: (_event, selected) => selected && setSpecificDate(selected),
    });
  };

  const openAndroidPrepareTimePicker = () => {
    DateTimePickerAndroid.open({
      value: prepareAt,
      mode: "time",
      onChange: (_event, selected) => selected && setPrepareAt(selected),
    });
  };

  // Cancels the previous OS notification (if any) and schedules the new
  // one, then persists the resulting trigger — as a draft item (first
  // write) or onto the existing item (only writer: setItemTrigger).
  const commitSchedule = async (date: Date) => {
    setSaving(true);
    try {
      const previousId =
        item?.trigger.type === "time" ? item.trigger.config?.notificationId : undefined;
      let notificationId: string | undefined;
      let webFallback = false;
      try {
        notificationId = await scheduleAt({
          title: "Before you go",
          body: `Don't forget ${displayName}.`,
          date,
          previousId,
        });
      } catch (err) {
        if (err instanceof Error && err.message === "unavailable-on-web") {
          webFallback = true;
        } else {
          throw err;
        }
      }

      const trigger: TriggerConfig = {
        type: "time",
        config: { time: date.toISOString(), notificationId },
      };

      if (isDraft) {
        const result = addItemWithTrigger(
          params.draftName as string,
          (params.draftSource as ItemSource) ?? "quickAdd",
          trigger,
        );
        if (result.status === "duplicate") {
          await cancel(notificationId);
          flash("Already on your list");
          return;
        }
        if (result.status === "limit") {
          await cancel(notificationId);
          setItemLimitVisible(true);
          return;
        }
      } else if (item) {
        setItemTrigger(item.id, trigger);
      } else {
        router.back();
        return;
      }

      if (webFallback) {
        flash("Preview can't schedule real notifications — try this on your phone.");
        setTimeout(() => router.back(), 1400);
        return;
      }
      router.back();
    } catch {
      flash("Couldn't schedule the reminder");
    } finally {
      setSaving(false);
    }
  };

  const handleSetReminder = async () => {
    const date = resolveDate();
    if (date.getTime() <= Date.now()) {
      flash("Pick a time in the future");
      return;
    }
    if (!isNotificationsAvailable) {
      await commitSchedule(date);
      return;
    }
    setSaving(true);
    const perm = await getPermissionStatus();
    setSaving(false);
    if (perm.status === "granted") {
      await commitSchedule(date);
      return;
    }
    if (perm.status === "denied" && !perm.canAskAgain) {
      setPendingDate(date);
      setBlockedVisible(true);
      return;
    }
    setPendingDate(date);
    setExplainVisible(true);
  };

  const handleRemindMe = async () => {
    setExplainVisible(false);
    setSaving(true);
    const result = await requestPermission();
    setSaving(false);
    if (result.status === "granted" && pendingDate) {
      await commitSchedule(pendingDate);
      return;
    }
    if (result.status === "denied" && !result.canAskAgain) {
      setBlockedVisible(true);
      return;
    }
    flash("You can turn this on later in Settings");
  };

  const handleRemoveReminder = async () => {
    if (!item) return;
    const previousId =
      item.trigger.type === "time" ? item.trigger.config?.notificationId : undefined;
    await cancel(previousId);
    setItemTrigger(item.id, { type: "leavingHome" });
    router.back();
  };

  const handleSaveSpecificDay = async () => {
    const scheduledDate = localDateKey(specificDate);
    if (scheduledDate < localDateKey(new Date())) {
      flash("Pick today or a future day");
      return;
    }
    const prepareTime = prepareAtEnabled
      ? `${String(prepareAt.getHours()).padStart(2, "0")}:${String(
          prepareAt.getMinutes(),
        ).padStart(2, "0")}`
      : null;

    if (item?.trigger.type === "time") {
      await cancel(item.trigger.config?.notificationId);
    }
    const result = saveOneTimePlan({
      name: displayName,
      scheduledDate,
      prepareTime,
      planId: plan?.id,
      removeItemId: item?.id,
    });
    if (result.status !== "ok") {
      flash("Couldn't save this day");
      return;
    }
    router.back();
  };

  const handleDeletePlan = () => {
    if (!plan) return;
    deleteOneTimePlan(plan.id);
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Remind me</Text>
        <Pressable
          testID="trigger-close"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.choices}>
          <TriggerRow
            testID="trigger-leaving"
            label="Leaving home"
            selected={type_ === "leaving"}
            onPress={() => setType("leaving")}
          />
          <View style={styles.divider} />
          <TriggerRow
            testID="trigger-time"
            label="At a time"
            selected={type_ === "time"}
            onPress={() => setType("time")}
          />
          <View style={styles.divider} />
          <TriggerRow
            testID="trigger-specific-day"
            label="Specific day"
            selected={type_ === "specificDay"}
            onPress={() => setType("specificDay")}
          />
        </View>

        {type_ === "leaving" ? (
          <View testID="trigger-leaving-state" style={styles.section}>
            <View style={styles.locationCard}>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{home?.name ?? "Home"}</Text>
                <Text style={styles.locationValue}>
                  {homeIsSet ? "Location set" : "Not set"}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                testID="location-change"
                onPress={() => router.push("/settings")}
              >
                <Text style={styles.change}>
                  {homeIsSet ? "Change" : "Set in Settings"}
                </Text>
              </Pressable>
            </View>
            {!homeIsSet ? (
              <Text style={styles.locationNote}>
                Go to Settings to set your Home location and enable departure reminders.
              </Text>
            ) : null}
          </View>
        ) : null}

        {type_ === "time" ? (
          <View testID="trigger-time-state" style={styles.section}>
            {(["Later today", "Tomorrow morning", "Choose date & time"] as TimeChoice[]).map(
              (opt) => (
                <TriggerRow
                  key={opt}
                  testID={`time-${opt}`}
                  label={opt}
                  selected={timeChoice === opt}
                  onPress={() => setTimeChoice(opt)}
                />
              ),
            )}

            {timeChoice === "Choose date & time" ? (
              Platform.OS === "ios" ? (
                <DateTimePicker
                  testID="date-time-picker"
                  value={customDate}
                  mode="datetime"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_event, selected) => selected && setCustomDate(selected)}
                  style={styles.iosPicker}
                />
              ) : (
                <Pressable
                  testID="open-date-time-picker"
                  onPress={openAndroidPicker}
                  style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}
                >
                  <Text style={styles.dateRowLabel}>
                    {formatReminderLabel(customDate.toISOString())}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.disabled} />
                </Pressable>
              )
            ) : (
              <Text testID="reminder-preview" style={styles.preview}>
                {isFutureChoice
                  ? `You'll be reminded ${formatReminderLabel(previewDate.toISOString())}.`
                  : "Pick a time in the future."}
              </Text>
            )}

            {!isNotificationsAvailable ? (
              <Text style={styles.webNote}>
                Real notifications only work on a phone — the browser preview can&apos;t
                schedule them.
              </Text>
            ) : null}

            {hasExistingTimeTrigger ? (
              <View style={styles.removeRow}>
                <TextButton
                  testID="remove-reminder"
                  title="Remove reminder"
                  color="#EF4444"
                  onPress={handleRemoveReminder}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {type_ === "specificDay" ? (
          <View testID="trigger-specific-day-state" style={styles.section}>
            <Text style={styles.whereLabel}>Day</Text>
            {Platform.OS === "ios" ? (
              <DateTimePicker
                testID="specific-day-picker"
                value={specificDate}
                mode="date"
                display="compact"
                minimumDate={dayjs().startOf("day").toDate()}
                onChange={(_event, selected) => selected && setSpecificDate(selected)}
              />
            ) : (
              <Pressable
                testID="open-specific-day-picker"
                onPress={openAndroidSpecificDatePicker}
                style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}
              >
                <Text style={styles.dateRowLabel}>
                  {dayjs(specificDate).format("ddd, MMM D, YYYY")}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.disabled} />
              </Pressable>
            )}

            <View style={styles.prepareToggleRow}>
              <View style={styles.locationInfo}>
                <Text style={styles.dateRowLabel}>Prepare at</Text>
                <Text style={styles.locationValue}>Optional</Text>
              </View>
              <Switch
                testID="prepare-at-toggle"
                value={prepareAtEnabled}
                onValueChange={setPrepareAtEnabled}
                trackColor={{ false: colors.border, true: colors.accent }}
              />
            </View>

            {prepareAtEnabled ? (
              Platform.OS === "ios" ? (
                <DateTimePicker
                  testID="prepare-at-picker"
                  value={prepareAt}
                  mode="time"
                  display="compact"
                  onChange={(_event, selected) => selected && setPrepareAt(selected)}
                />
              ) : (
                <Pressable
                  testID="open-prepare-at-picker"
                  onPress={openAndroidPrepareTimePicker}
                  style={({ pressed }) => [styles.dateRow, pressed && styles.pressed]}
                >
                  <Text style={styles.dateRowLabel}>{dayjs(prepareAt).format("h:mm A")}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.disabled} />
                </Pressable>
              )
            ) : (
              <Text style={styles.preview}>Activates at the start of the selected day.</Text>
            )}

            {plan ? (
              <View style={styles.removeRow}>
                <TextButton
                  testID="delete-one-time-plan"
                  title="Remove planned item"
                  color="#EF4444"
                  onPress={handleDeletePlan}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {type_ === "time" ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            testID="set-reminder-button"
            title="Set reminder"
            onPress={handleSetReminder}
            disabled={!isFutureChoice}
            loading={saving}
          />
        </View>
      ) : null}

      {type_ === "specificDay" ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            testID="save-specific-day"
            title={plan ? "Save changes" : "Plan item"}
            onPress={handleSaveSpecificDay}
            loading={saving}
          />
        </View>
      ) : null}

      <Toast message={toast} visible={!!toast} testID="trigger-toast" />

      <BottomSheet visible={explainVisible} onClose={() => setExplainVisible(false)}>
        <PermissionExplanation
          testID="notification-permission"
          title="Get reminded before it's too late"
          body="CarryCue can notify you before or as you leave, so you remember what to bring."
          primaryLabel="Remind me"
          onPrimary={handleRemindMe}
          onDismiss={() => setExplainVisible(false)}
        />
      </BottomSheet>

      <BottomSheet visible={blockedVisible} onClose={() => setBlockedVisible(false)}>
        <PermissionExplanation
          testID="notification-blocked"
          title="Notifications are off"
          body="Turn on notifications for CarryCue in Settings to get this reminder."
          primaryLabel="Open Settings"
          onPrimary={() => {
            setBlockedVisible(false);
            Linking.openSettings();
          }}
          onDismiss={() => setBlockedVisible(false)}
        />
      </BottomSheet>

      <UpgradeSheet
        visible={itemLimitVisible}
        reason="items"
        onClose={() => setItemLimitVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pressed: {
    opacity: 0.5,
  },
  title: {
    fontSize: type.navTitle,
    fontWeight: font.bold,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  choices: {
    marginTop: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  section: {
    marginTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: type.sectionLabel,
    fontWeight: font.semibold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  locationValue: {
    fontSize: type.checklistItem,
    color: colors.textPrimary,
    marginTop: 4,
  },
  change: {
    fontSize: type.button,
    fontWeight: font.semibold,
    color: colors.accent,
  },
  locationNote: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  whereLabel: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
    marginTop: spacing.sm,
  },
  dateRowLabel: {
    fontSize: type.checklistItem,
    fontWeight: font.medium,
    color: colors.textPrimary,
  },
  iosPicker: {
    marginTop: spacing.xs,
    alignSelf: "center",
  },
  preview: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  webNote: {
    fontSize: type.secondary,
    color: colors.disabled,
    marginTop: spacing.sm,
    lineHeight: 19,
  },
  removeRow: {
    marginTop: spacing.md,
    alignItems: "flex-start",
  },
  prepareToggleRow: {
    minHeight: 60,
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
