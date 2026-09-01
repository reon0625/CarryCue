// Pure, deterministic selection and formatting for Leaving Home notifications.
// Native notification and geofence APIs deliberately stay out of this module.

import {
  CarryItem,
  UsageStats,
  normalizeName,
} from "@/src/data/models";

export const DEPARTURE_NOTIFICATION_TITLE = "Before you go";
export const MAX_DEPARTURE_NOTIFICATION_NAMES = 3;

export type DepartureReminder = {
  title: typeof DEPARTURE_NOTIFICATION_TITLE;
  body: string;
  items: CarryItem[];
};

function forgottenTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Selects only current, incomplete Leaving Home items, then ranks them by:
 * 1. forgotten count (descending)
 * 2. most recent forgotten timestamp (descending)
 * 3. current CarryItem order (stable deterministic tie-break)
 *
 * Usage history can reorder current items, but can never insert an item.
 */
export function rankDepartureItems(
  items: readonly CarryItem[],
  usageStats: UsageStats,
): CarryItem[] {
  return items
    .map((item, index) => {
      const stat = usageStats[normalizeName(item.name)];
      return {
        item,
        index,
        forgottenCount: stat?.forgottenCount ?? 0,
        lastForgottenAt: forgottenTimestamp(stat?.lastForgottenAt),
      };
    })
    .filter(
      ({ item }) =>
        !item.completed && item.trigger.type === "leavingHome",
    )
    .sort((a, b) => {
      if (b.forgottenCount !== a.forgottenCount) {
        return b.forgottenCount - a.forgottenCount;
      }
      if (b.lastForgottenAt !== a.lastForgottenAt) {
        return b.lastForgottenAt - a.lastForgottenAt;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function formatDepartureNotificationBody(
  items: readonly Pick<CarryItem, "name">[],
): string {
  const shown = items.slice(0, MAX_DEPARTURE_NOTIFICATION_NAMES);
  const remaining = items.length - shown.length;
  const names = shown.map((item) => item.name.trim()).join(" · ");
  return remaining > 0 ? `${names} +${remaining} more` : names;
}

export function buildDepartureReminder(
  items: readonly CarryItem[],
  usageStats: UsageStats,
): DepartureReminder | null {
  const rankedItems = rankDepartureItems(items, usageStats);
  if (rankedItems.length === 0) return null;
  return {
    title: DEPARTURE_NOTIFICATION_TITLE,
    body: formatDepartureNotificationBody(rankedItems),
    items: rankedItems,
  };
}
