// Pure one-time-plan evaluation and editing transforms. Native APIs, React,
// and persistence deliberately stay outside this module.

import { uid } from "@/src/data/id";
import { getLimits } from "@/src/data/limits";
import {
  AppState,
  CarryItem,
  OneTimePlan,
  normalizeName,
} from "@/src/data/models";
import { localDateKey } from "@/src/services/routineScheduling";

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function isValidLocalDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function isValidPrepareTime(value: string | null): boolean {
  if (value === null) return true;
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function minuteOfDay(value: string | null): number {
  if (value === null) return 0;
  const match = TIME_PATTERN.exec(value);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1]) * 60 + Number(match[2]);
}

export type OneTimePlanEvaluation = {
  state: AppState;
  activatedPlanIds: string[];
  consumedDuplicatePlanIds: string[];
  blockedPlanIds: string[];
  expiredPlanIds: string[];
};

/**
 * Evaluates the selected local calendar date only. A missed prepare time is
 * caught later that same day. Plans from older calendar dates expire and are
 * never backfilled, preventing a stale surprise reminder.
 */
export function evaluateDueOneTimePlans(
  state: AppState,
  now: Date,
  createId: () => string = uid,
): OneTimePlanEvaluation {
  const today = localDateKey(now);
  const timestamp = now.toISOString();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const maxItems = getLimits(state.settings.entitlement).maxDepartureItems;
  let capacity = Math.max(0, maxItems - state.items.length);
  const existingNames = new Set(state.items.map((item) => normalizeName(item.name)));
  const newItems: CarryItem[] = [];
  const activatedPlanIds: string[] = [];
  const consumedDuplicatePlanIds: string[] = [];
  const blockedPlanIds: string[] = [];
  const expiredPlanIds: string[] = [];
  let usageStats = state.usageStats;
  let changed = false;

  const oneTimePlans = state.oneTimePlans.map((plan) => {
    if (plan.status !== "pending") return plan;
    if (plan.scheduledDate > today) return plan;

    if (plan.scheduledDate < today) {
      changed = true;
      expiredPlanIds.push(plan.id);
      return {
        ...plan,
        status: "expired" as const,
        expiredAt: timestamp,
        updatedAt: timestamp,
      };
    }

    if (currentMinute < minuteOfDay(plan.prepareTime)) return plan;

    const normalized = normalizeName(plan.name);
    if (existingNames.has(normalized)) {
      changed = true;
      consumedDuplicatePlanIds.push(plan.id);
      return {
        ...plan,
        status: "consumed" as const,
        consumedAt: timestamp,
        updatedAt: timestamp,
      };
    }

    if (capacity <= 0) {
      blockedPlanIds.push(plan.id);
      return plan;
    }

    changed = true;
    capacity -= 1;
    existingNames.add(normalized);
    activatedPlanIds.push(plan.id);
    newItems.push({
      id: createId(),
      name: plan.name.trim(),
      completed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      trigger: { type: "leavingHome" },
      source: "oneTimePlan",
    });

    const existingStat = usageStats[normalized];
    usageStats = {
      ...usageStats,
      [normalized]: {
        name: plan.name.trim(),
        addedCount: (existingStat?.addedCount ?? 0) + 1,
        forgottenCount: existingStat?.forgottenCount ?? 0,
        lastUsedAt: timestamp,
        lastForgottenAt: existingStat?.lastForgottenAt ?? null,
      },
    };

    return {
      ...plan,
      status: "consumed" as const,
      consumedAt: timestamp,
      updatedAt: timestamp,
    };
  });

  return {
    state: changed
      ? {
          ...state,
          items: [...newItems, ...state.items],
          oneTimePlans,
          usageStats,
        }
      : state,
    activatedPlanIds,
    consumedDuplicatePlanIds,
    blockedPlanIds,
    expiredPlanIds,
  };
}

export type OneTimePlanScheduleUpdate = Pick<
  OneTimePlan,
  "scheduledDate" | "prepareTime"
>;

export function updatePendingOneTimePlan(
  state: AppState,
  planId: string,
  updates: OneTimePlanScheduleUpdate,
  now: Date,
): AppState {
  if (
    !isValidLocalDateKey(updates.scheduledDate) ||
    !isValidPrepareTime(updates.prepareTime)
  ) {
    return state;
  }
  let changed = false;
  const oneTimePlans = state.oneTimePlans.map((plan) => {
    if (plan.id !== planId || plan.status !== "pending") return plan;
    changed = true;
    return {
      ...plan,
      ...updates,
      updatedAt: now.toISOString(),
    };
  });
  return changed ? { ...state, oneTimePlans } : state;
}

export function deletePendingOneTimePlan(
  state: AppState,
  planId: string,
): AppState {
  const oneTimePlans = state.oneTimePlans.filter(
    (plan) => plan.id !== planId || plan.status !== "pending",
  );
  return oneTimePlans.length === state.oneTimePlans.length
    ? state
    : { ...state, oneTimePlans };
}
