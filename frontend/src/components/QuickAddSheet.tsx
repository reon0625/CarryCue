import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BottomSheet } from "@/src/components/BottomSheet";
import { Chip } from "@/src/components/Chip";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { SectionLabel } from "@/src/components/SectionLabel";
import { TriggerRow } from "@/src/components/TriggerRow";
import { normalizeName } from "@/src/data/models";
import { useStore } from "@/src/state/store";
import { colors, font, spacing, type } from "@/src/theme";

type Remind = "leaving" | "tomorrow" | "choose";

export function QuickAddSheet({
  visible,
  onClose,
  frequentlyUsed,
  onLimitReached,
  prefillText,
}: {
  visible: boolean;
  onClose: () => void;
  frequentlyUsed: string[];
  onLimitReached?: () => void;
  /** Optional text pre-populated from a deep-link or shortcut (carrycue://add?text=…). */
  prefillText?: string;
}) {
  const router = useRouter();
  const { addItem, items, limits } = useStore();
  const [text, setText] = useState("");
  const [remind, setRemind] = useState<Remind>("leaving");
  const [dupMsg, setDupMsg] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      // Pre-populate from deep-link or shortcut; fall back to empty.
      setText(prefillText ?? "");
      setRemind("leaving");
      setDupMsg("");
      // Focus after the open animation so the native keyboard reliably
      // raises on both iOS and Android (autoFocus alone can miss inside an
      // animated/remounting view).
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const result = addItem(trimmed, "quickAdd");
    if (result.status === "duplicate") {
      setDupMsg("Already on your list");
      return;
    }
    if (result.status === "limit") {
      onClose();
      onLimitReached?.();
      return;
    }
    onClose();
  };

  const addFrequent = (name: string) => {
    const result = addItem(name, "frequentlyUsed");
    if (result.status === "duplicate") {
      setDupMsg("Already on your list");
      return;
    }
    if (result.status === "limit") {
      onClose();
      onLimitReached?.();
      return;
    }
    onClose();
  };

  // Step 3A: this item is NOT persisted here. It stays a draft — carried
  // as route params — until Trigger Setup's reminder is actually confirmed,
  // so nothing is saved if the user just backs out of that screen.
  const chooseTimeOrPlace = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const key = normalizeName(trimmed);
    const isDuplicate = items.some((it) => normalizeName(it.name) === key);
    if (isDuplicate) {
      setDupMsg("Already on your list");
      return;
    }
    if (items.length >= limits.maxDepartureItems) {
      onClose();
      onLimitReached?.();
      return;
    }
    onClose();
    setTimeout(
      () =>
        router.push({
          pathname: "/trigger",
          params: { draftName: trimmed, draftSource: "quickAdd" },
        }),
      220,
    );
  };

  const hasText = text.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="quick-add-sheet">
      <Text style={styles.title}>What do you need?</Text>
      <TextInput
        ref={inputRef}
        testID="quick-add-input"
        autoFocus
        showSoftInputOnFocus
        value={text}
        onChangeText={(t) => {
          setText(t);
          if (dupMsg) setDupMsg("");
        }}
        placeholder="Charger"
        placeholderTextColor={colors.disabled}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={save}
        autoCapitalize="sentences"
      />
      {dupMsg ? (
        <Text style={styles.dupMsg} testID="quick-add-dup-message">
          {dupMsg}
        </Text>
      ) : null}

      {hasText ? (
        <View style={styles.section}>
          <SectionLabel>Remind me</SectionLabel>
          <View style={styles.options}>
            <TriggerRow
              testID="remind-leaving"
              label="When leaving home"
              selected={remind === "leaving"}
              onPress={() => setRemind("leaving")}
            />
            <View style={styles.divider} />
            <TriggerRow
              testID="remind-tomorrow"
              label="Tomorrow morning"
              selected={remind === "tomorrow"}
              onPress={() => setRemind("tomorrow")}
            />
            <View style={styles.divider} />
            <TriggerRow
              testID="remind-choose"
              label="Choose time or place"
              selected={remind === "choose"}
              onPress={chooseTimeOrPlace}
            />
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <SectionLabel>Suggestions</SectionLabel>
          {frequentlyUsed.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled"
            >
              {frequentlyUsed.map((f) => (
                <Chip
                  key={f}
                  testID={`quick-frequent-${f}`}
                  label={f}
                  onPress={() => addFrequent(f)}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      )}

      <View style={styles.addButton}>
        <PrimaryButton
          title="Add"
          onPress={save}
          disabled={!hasText}
          testID="quick-add-save"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  input: {
    fontSize: 18,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dupMsg: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  options: {
    marginTop: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  chips: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
  },
  addButton: {
    marginTop: spacing.lg,
  },
});
