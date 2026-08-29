import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "@/src/components/BottomSheet";
import { TextButton } from "@/src/components/TextButton";
import { TriggerRow } from "@/src/components/TriggerRow";
import { UpgradeSheet } from "@/src/components/UpgradeSheet";
import { useStore } from "@/src/state/store";
import { colors, font, radius, spacing, type } from "@/src/theme";

type TriggerType = "leaving" | "time" | "arriving";

export default function Trigger() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locations, addLocation } = useStore();
  const [type_, setType] = useState<TriggerType>("leaving");
  const [timeChoice, setTimeChoice] = useState("Tomorrow morning");
  const [place, setPlace] = useState("");
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const home = locations[0];

  const handleAddLocation = () => {
    const nextName = `Location ${locations.length + 1}`;
    const result = addLocation(nextName, "Set address");
    if (result.status === "limit") {
      setLocationsOpen(false);
      setUpgradeVisible(true);
    }
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
            testID="trigger-arriving"
            label="Arriving somewhere"
            selected={type_ === "arriving"}
            onPress={() => setType("arriving")}
          />
        </View>

        {type_ === "leaving" ? (
          <View testID="trigger-leaving-state" style={styles.section}>
            <View style={styles.locationCard}>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{home?.name ?? "Home"}</Text>
                <Text style={styles.locationValue}>{home?.address ?? "Shibuya, Tokyo"}</Text>
              </View>
              <Pressable
                hitSlop={8}
                testID="location-change"
                onPress={() => setLocationsOpen(true)}
              >
                <Text style={styles.change}>Change</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {type_ === "time" ? (
          <View testID="trigger-time-state" style={styles.section}>
            {["Later today", "Tomorrow morning", "Choose date & time"].map(
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
          </View>
        ) : null}

        {type_ === "arriving" ? (
          <View testID="trigger-arriving-state" style={styles.section}>
            <Text style={styles.whereLabel}>Where?</Text>
            <TextInput
              testID="place-search"
              value={place}
              onChangeText={setPlace}
              placeholder="Search place"
              placeholderTextColor={colors.disabled}
              style={styles.search}
            />
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={locationsOpen}
        onClose={() => setLocationsOpen(false)}
        testID="locations-sheet"
      >
        <Text style={styles.whereLabel}>Locations</Text>
        {locations.map((loc) => (
          <View key={loc.id} style={styles.locationListRow}>
            <Text style={styles.locationListName}>{loc.name}</Text>
            <Text style={styles.locationListAddress}>{loc.address}</Text>
          </View>
        ))}
        <View style={styles.addLocationButton}>
          <TextButton
            testID="add-location-button"
            title="Add location"
            icon="add"
            onPress={handleAddLocation}
          />
        </View>
      </BottomSheet>

      <UpgradeSheet
        visible={upgradeVisible}
        reason="locations"
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
  whereLabel: {
    fontSize: type.contextTitle,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  search: {
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: type.checklistItem,
    color: colors.textPrimary,
  },
  locationListRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  locationListName: {
    fontSize: type.checklistItem,
    fontWeight: font.medium,
    color: colors.textPrimary,
  },
  locationListAddress: {
    fontSize: type.secondary,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addLocationButton: {
    marginTop: spacing.sm,
  },
});
