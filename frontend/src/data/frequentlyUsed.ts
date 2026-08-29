// Deterministic (no AI) Frequently Used ranking.
//
// Ranks by a simple weighted score: usage frequency, forgotten frequency
// (an item you keep forgetting is *more* worth surfacing, not less), and
// recency of either signal. Ties break alphabetically so the result is
// stable across renders/restarts given the same stored data. Scores are an
// internal implementation detail and are never shown in the UI.

import { UsageStats } from "@/src/data/models";

const RECENCY_WINDOW_DAYS = 30;

function recencyScore(iso: string | null, now: number): number {
  if (!iso) return 0;
  const days = (now - new Date(iso).getTime()) / 86_400_000;
  if (days < 0) return 5; // guard against clock skew
  if (days >= RECENCY_WINDOW_DAYS) return 0;
  return 5 * (1 - days / RECENCY_WINDOW_DAYS);
}

export function computeFrequentlyUsed(stats: UsageStats, limit = 5): string[] {
  const now = Date.now();
  const scored = Object.values(stats).map((s) => ({
    name: s.name,
    score:
      s.addedCount * 2 +
      s.forgottenCount * 3 +
      recencyScore(s.lastUsedAt, now) +
      recencyScore(s.lastForgottenAt, now) * 0.5,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return scored.slice(0, limit).map((s) => s.name);
}
