import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { TextButton } from "@/src/components/TextButton";
import { useStore } from "@/src/state/store";
import { colors, font, spacing, type } from "@/src/theme";

export default function Forgot() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addFrequent, addItem } = useStore();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [always, setAlways] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addFrequent(trimmed);
    addItem(trimmed);
    inputRef.current?.blur();
    setSaved(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Forgot something?</Text>
        <Pressable
          testID="forgot-close"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 60}
      >
        {saved ? (
          <View style={styles.savedWrap} testID="forgot-saved-state">
            <View style={styles.savedIcon}>
              <Ionicons name="checkmark" size={30} color={colors.accent} />
            </View>
            <Text style={styles.savedTitle}>Saved</Text>
            <Text style={styles.savedBody}>We&apos;ll remind you next time.</Text>

            <Pressable
              testID="forgot-always-remind"
              onPress={() => setAlways((a) => !a)}
              style={({ pressed }) => [
                styles.alwaysRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.checkbox, always && styles.checkboxOn]}>
                {always ? (
                  <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                ) : null}
              </View>
              <Text style={styles.alwaysText}>Always remind me</Text>
            </Pressable>

            <View style={styles.doneButton}>
              <PrimaryButton
                title="Done"
                onPress={() => router.back()}
                testID="forgot-done"
              />
            </View>
          </View>
        ) : (
          <View style={styles.flex}>
            <View style={styles.content}>
              <Text style={styles.prompt}>What did you leave behind?</Text>
              <TextInput
                ref={inputRef}
                testID="forgot-input"
                value={text}
                onChangeText={setText}
                placeholder="Student ID"
                placeholderTextColor={colors.disabled}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={save}
                autoCapitalize="sentences"
              />
            </View>
            <View
              style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
            >
              <PrimaryButton
                title="Add for next time"
                onPress={save}
                disabled={!text.trim()}
                testID="forgot-add"
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
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
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  prompt: {
    fontSize: type.contextTitle,
    fontWeight: font.medium,
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
  footer: {
    paddingHorizontal: spacing.lg,
  },
  savedWrap: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  savedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  savedTitle: {
    fontSize: type.navTitle,
    fontWeight: font.bold,
    color: colors.textPrimary,
  },
  savedBody: {
    fontSize: type.secondary + 1,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  alwaysRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: spacing.xl,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: colors.disabled,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  alwaysText: {
    fontSize: type.checklistItem,
    color: colors.textPrimary,
  },
  doneButton: {
    alignSelf: "stretch",
    marginTop: "auto",
    marginBottom: spacing.xl,
  },
});
