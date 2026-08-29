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
import { useStore } from "@/src/state/store";
import { colors, font, spacing, type } from "@/src/theme";

const QUICK_FREQUENTS = ["Wallet", "Keys", "Earbuds", "Charger"];
type Remind = "leaving" | "tomorrow" | "choose";

export function QuickAddSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { addItem } = useStore();
  const [text, setText] = useState("");
  const [remind, setRemind] = useState<Remind>("leaving");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setText("");
      setRemind("leaving");
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addItem(trimmed);
    onClose();
  };

  const addFrequent = (name: string) => {
    addItem(name);
    onClose();
  };

  const chooseTimeOrPlace = () => {
    onClose();
    setTimeout(() => router.push("/trigger"), 220);
  };

  const hasText = text.trim().length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose} testID="quick-add-sheet">
      <Text style={styles.title}>What do you need?</Text>
      <TextInput
        ref={inputRef}
        testID="quick-add-input"
        value={text}
        onChangeText={setText}
        placeholder="Charger"
        placeholderTextColor={colors.disabled}
        style={styles.input}
        returnKeyType="done"
        onSubmitEditing={save}
        autoCapitalize="sentences"
      />

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
          <SectionLabel>Frequently used</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_FREQUENTS.map((f) => (
              <Chip
                key={f}
                testID={`quick-frequent-${f}`}
                label={f}
                onPress={() => addFrequent(f)}
              />
            ))}
          </ScrollView>
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
    fontSize: 20,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
