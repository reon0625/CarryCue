// Pure scheduled-Routine evaluation and departure lifecycle transforms.
// Local persistence, React, TaskManager, and native APIs live elsewhere.

import { getLimits } from "@/src/data/limits";
import {
  AppState,
  CarryItem,
  Routine,
  normalizeName,
} from "@/src/data/models";
import { uid } from "@/src/data/id";

const pad2 = (value: number): string => String(value).padStart(2, "0");

export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}

export function routineOccurrenceKey(routineId: string, date: Date): string {
  return `${routineId}:${localDateKey(date)}`;
}

function scheduledMinuteOfDay(prepareTime: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(prepareTime);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isRoutineOccurrenceDue(
  routine: Routine,
  now: Date,
): boolean {
  const { schedule } = routine;
  if (!schedule.enabled || !schedule.weekdays.includes(now.getDay())) {
    return false;
  }
  const prepareMinute = scheduledMinuteOfDay(schedule.prepareTime);
  if (prepareMinute === null) return false;
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  if (currentMinute < prepareMinute) return false;
  const occurrenceKey = routineOccurrenceKey(routine.id, now);
  return (
    schedule.lastPreparedOccurrenceKey === null ||
    schedule.lastPreparedOccurrenceKey < occurrenceKey
  );
}

export type ScheduledRoutineActivation = {
  routineId: string;
  occurrenceKey: string;
  addedNames: string[];
  limited: boolean;
};

export type ScheduledRoutineEvaluation = {
  state: AppState;
  activations: ScheduledRoutineActivation[];
};

/**
 * Evaluates only today's local occurrence. A missed time is caught later the
 * same day; past calendar days are never backfilled.
 */
export function evaluateDueScheduledRoutines(
  state: AppState,
  now: Date,
  createId: () => string = uid,
): ScheduledRoutineEvaluation {
  const timestamp = now.toISOString();
  const maxItems = getLimits(state.settings.entitlement).maxDepartureItems;
  let capacity = Math.max(0, maxItems - state.items.length);
  const existingNames = new Set(
    state.items.map((item) => normalizeName(item.name)),
  );
  const preparedItems: CarryItem[] = [];
  const activations: ScheduledRoutineActivation[] = [];
  let usageStats = state.usageStats;

  const routines = state.routines.map((routine) => {
    if (!isRoutineOccurrenceDue(routine, now)) return routine;

    const occurrenceKey = routineOccurrenceKey(routine.id, now);
    const addedNames: string[] = [];
    let limited = false;

    for (const routineItem of routine.items) {
      const name = routineItem.name.trim();
      const normalized = normalizeName(name);
      if (!name || existingNames.has(normalized)) continue;
      if (capacity <= 0) {
        limited = true;
        continue;
      }

      existingNames.add(normalized);
      capacity -= 1;
      addedNames.push(name);
      preparedItems.push({
        id: createId(),
        name,
        completed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        trigger: { type: "leavingHome" },
        source: "routine",
      });

      const existingStat = usageStats[normalized];
      usageStats = {
        ...usageStats,
        [normalized]: {
          name,
          addedCount: (existingStat?.addedCount ?? 0) + 1,
          forgottenCount: existingStat?.forgottenCount ?? 0,
          lastUsedAt: timestamp,
          lastForgottenAt: existingStat?.lastForgottenAt ?? null,
        },
      };
    }

    activations.push({
      routineId: routine.id,
      occurrenceKey,
      addedNames,
      limited,
    });
    return {
      ...routine,
      schedule: {
        ...routine.schedule,
        lastPreparedOccurrenceKey: occurrenceKey,
      },
      updatedAt: timestamp,
    };
  });

  if (activations.length === 0) return { state, activations };

  return {
    state: {
      ...state,
      items: [...preparedItems, ...state.items],
      routines,
      usageStats,
    },
    activations,
  };
}

export type DepartureLifecycleEvent =
  | "realExit"
  | "realEnter"
  | "simulatedExit";

export type DepartureLifecycleResult = {
  state: AppState;
  departureStarted: boolean;
  departureClosed: boolean;
  removedItemIds: string[];
};

export function applyDepartureLifecycleEvent(
  state: AppState,
  event: DepartureLifecycleEvent,
  now: Date,
): DepartureLifecycleResult {
  if (event === "simulatedExit") {
    return {
      state,
      departureStarted: false,
      departureClosed: false,
      removedItemIds: [],
    };
  }

  if (event === "realExit") {
    if (state.departure.status === "departed") {
      return {
        state,
        departureStarted: false,
        departureClosed: false,
        removedItemIds: [],
      };
    }
    return {
      state: {
        ...state,
        departure: {
          status: "departed",
          departedAt: now.toISOString(),
        },
      },
      departureStarted: true,
      departureClosed: false,
      removedItemIds: [],
    };
  }

  if (state.departure.status !== "departed") {
    return {
      state,
      departureStarted: false,
      departureClosed: false,
      removedItemIds: [],
    };
  }

  const removedItemIds = state.items
    .filter(
      (item) =>
        item.completed && item.trigger.type === "leavingHome",
    )
    .map((item) => item.id);
  const removedIds = new Set(removedItemIds);

  return {
    state: {
      ...state,
      items: state.items.filter((item) => !removedIds.has(item.id)),
      departure: {
        status: "home",
        departedAt: null,
      },
    },
    departureStarted: false,
    departureClosed: true,
    removedItemIds,
  };
}
