// CarryCue — Step 4A: Deep-link Quick Capture service.
//
// This module owns all deep-link intent storage and diagnostics. It is
// intentionally free of React / Expo-Router imports so it can be used from
// any part of the app (add.tsx, shortcuts.tsx, home.tsx, settings.tsx).

import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Storage keys ─────────────────────────────────────────────────────────────

/** One-shot intent written by deep-link handler; consumed by home.tsx. */
export const PENDING_QUICK_ADD_KEY = "carrycue_pending_quick_add";

/** Dev-only diagnostics for the Settings debug panel. */
export const LINK_DIAG_KEY = "carrycue_last_link_diag";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PendingQuickAdd = {
  text: string | null;
  timestamp: number;
};

export type LinkDiagnostics = {
  url: string;
  path: string;
  text: string | null;
  openedQuickAdd: boolean;
  timestamp: string;
};

// ── Intent TTL ────────────────────────────────────────────────────────────────

// Intents older than this are silently discarded so a stale shortcut tap
// never opens Quick Add on an unrelated future app launch.
const INTENT_TTL_MS = 15_000; // 15 seconds

// ── Intent helpers ────────────────────────────────────────────────────────────

/**
 * Store a Quick Add intent with the optional prefill text.
 * Called from add.tsx (deep-link) and shortcuts.tsx (Test Quick Add).
 */
export async function storePendingQuickAdd(text: string | null): Promise<void> {
  const intent: PendingQuickAdd = { text, timestamp: Date.now() };
  await AsyncStorage.setItem(PENDING_QUICK_ADD_KEY, JSON.stringify(intent));
}

/**
 * Consume the pending Quick Add intent (one-shot).
 * Returns { text } if a valid, non-expired intent exists.
 * Always removes the entry from AsyncStorage after reading.
 * Returns null if no intent or if it has expired.
 */
export async function consumePendingQuickAdd(): Promise<{ text: string | null } | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_QUICK_ADD_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(PENDING_QUICK_ADD_KEY);
    const intent = JSON.parse(raw) as PendingQuickAdd;
    if (Date.now() - intent.timestamp > INTENT_TTL_MS) return null;
    return { text: intent.text };
  } catch {
    if (raw !== null) {
      AsyncStorage.removeItem(PENDING_QUICK_ADD_KEY).catch(() => {});
    }
    return null;
  }
}

// ── Diagnostics helpers ───────────────────────────────────────────────────────

/**
 * Write link diagnostics for the Settings dev panel.
 * No-op in production builds.
 */
export async function writeLinkDiagnostics(diag: LinkDiagnostics): Promise<void> {
  if (!__DEV__) return;
  try {
    await AsyncStorage.setItem(LINK_DIAG_KEY, JSON.stringify(diag));
  } catch { /* ignore */ }
}

/**
 * Read the last recorded link diagnostics.
 * Returns null if none have been written yet or if parsing fails.
 */
export async function readLinkDiagnostics(): Promise<LinkDiagnostics | null> {
  try {
    const raw = await AsyncStorage.getItem(LINK_DIAG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LinkDiagnostics;
  } catch {
    return null;
  }
}
