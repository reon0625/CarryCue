import {
  AppState,
  CarryItem,
  Routine,
  createDefaultRoutineSchedule,
} from "@/src/data/models";
import {
  applyDepartureLifecycleEvent,
  evaluateDueScheduledRoutines,
  isRoutineOccurrenceDue,
  routineOccurrenceKey,
} from "@/src/services/routineScheduling";

const tuesday = (hour: number, minute = 0): Date =>
  new Date(2026, 8, 1, hour, minute, 0, 0);

function routine(
  id: string,
  names: string[],
  overrides: Partial<Routine["schedule"]> = {},
): Routine {
  return {
    id,
    name: id,
    items: names.map((name, index) => ({
      id: `${id}-template-${index}`,
      name,
      completed: false,
    })),
    isSeed: false,
    schedule: {
      ...createDefaultRoutineSchedule(),
      enabled: true,
      weekdays: [2],
      prepareTime: "07:30",
      ...overrides,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function carryItem(
  name: string,
  overrides: Partial<CarryItem> = {},
): CarryItem {
  return {
    id: `item-${name}`,
    name,
    completed: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trigger: { type: "leavingHome" },
    source: "quickAdd",
    ...overrides,
  };
}

function state(
  routines: Routine[],
  items: CarryItem[] = [],
): AppState {
  return {
    schemaVersion: 5,
    items,
    routines,
    oneTimePlans: [],
    usageStats: {},
    departure: { status: "home", departedAt: null },
    settings: {
      onboardingCompleted: true,
      leaveTime: "8:30",
      notificationsEnabled: true,
      entitlement: "PRO",
      locations: [],
    },
  };
}

function ids(): () => string {
  let next = 0;
  return () => `generated-${++next}`;
}

describe("scheduled Routine evaluation", () => {
  test("weekday schedule becomes due", () => {
    expect(isRoutineOccurrenceDue(routine("University", ["ID"]), tuesday(7, 30))).toBe(true);
  });

  test("wrong weekday does not activate", () => {
    const scheduled = routine("Gym", ["Shoes"], { weekdays: [1, 3, 5] });
    expect(evaluateDueScheduledRoutines(state([scheduled]), tuesday(18), ids()).activations).toEqual([]);
  });

  test("before scheduled time does not activate", () => {
    const result = evaluateDueScheduledRoutines(
      state([routine("University", ["ID"])]),
      tuesday(7, 29),
      ids(),
    );
    expect(result.activations).toEqual([]);
    expect(result.state.items).toEqual([]);
  });

  test("after scheduled time activates", () => {
    const result = evaluateDueScheduledRoutines(
      state([routine("University", ["ID", "Laptop"])]),
      tuesday(9),
      ids(),
    );
    expect(result.activations).toHaveLength(1);
    expect(result.state.items.map(({ name }) => name)).toEqual(["ID", "Laptop"]);
  });

  test("same occurrence cannot activate twice", () => {
    const first = evaluateDueScheduledRoutines(
      state([routine("Gym", ["Shoes"])]),
      tuesday(8),
      ids(),
    );
    const second = evaluateDueScheduledRoutines(first.state, tuesday(12), ids());
    expect(second.activations).toEqual([]);
    expect(second.state.items.map(({ name }) => name)).toEqual(["Shoes"]);
  });

  test("persisted occurrence survives an app restart without duplication", () => {
    const first = evaluateDueScheduledRoutines(
      state([routine("Gym", ["Shoes"])]),
      tuesday(8),
      ids(),
    );
    const reloaded = JSON.parse(JSON.stringify(first.state)) as AppState;
    const second = evaluateDueScheduledRoutines(reloaded, tuesday(20), ids());
    expect(second.activations).toEqual([]);
    expect(second.state.items).toHaveLength(1);
  });

  test("clock rollback cannot replay an older prepared occurrence", () => {
    const scheduled = routine("Gym", ["Shoes"], {
      lastPreparedOccurrenceKey: "Gym:2026-09-08",
    });
    expect(isRoutineOccurrenceDue(scheduled, tuesday(8))).toBe(false);
  });

  test("duplicate normalized Routine items are not inserted twice", () => {
    const result = evaluateDueScheduledRoutines(
      state([routine("Travel", ["Passport", " passport "])]),
      tuesday(8),
      ids(),
    );
    expect(result.state.items.map(({ name }) => name)).toEqual(["Passport"]);
  });

  test("a manually existing item is preserved and not duplicated", () => {
    const manual = carryItem("Student ID");
    const result = evaluateDueScheduledRoutines(
      state([routine("University", ["student id", "Laptop"])], [manual]),
      tuesday(8),
      ids(),
    );
    expect(result.state.items.map(({ name }) => name)).toEqual([
      "Laptop",
      "Student ID",
    ]);
    expect(result.state.items[1]).toBe(manual);
  });

  test("multiple due Routines coexist and deduplicate across each other", () => {
    const result = evaluateDueScheduledRoutines(
      state([
        routine("University", ["ID", "Charger"]),
        routine("Gym", ["Bottle", "charger"]),
      ]),
      tuesday(8),
      ids(),
    );
    expect(result.activations).toHaveLength(2);
    expect(result.state.items.map(({ name }) => name)).toEqual([
      "ID",
      "Charger",
      "Bottle",
    ]);
  });

  test("automatic preparation preserves the Free departure item limit", () => {
    const existing = ["A", "B", "C", "D"].map((name) => carryItem(name));
    const freeState = state(
      [routine("University", ["Laptop", "Charger"])],
      existing,
    );
    freeState.settings.entitlement = "FREE";
    const result = evaluateDueScheduledRoutines(
      freeState,
      tuesday(8),
      ids(),
    );
    expect(result.state.items).toHaveLength(5);
    expect(result.activations[0]).toMatchObject({
      addedNames: ["Laptop"],
      limited: true,
    });
  });

  test("occurrence key uses the Routine id and local calendar date", () => {
    expect(routineOccurrenceKey("gym", tuesday(8))).toBe("gym:2026-09-01");
  });
});

describe("departure lifecycle", () => {
  test("real EXIT marks departure without immediately clearing items", () => {
    const completed = carryItem("ID", { completed: true });
    const result = applyDepartureLifecycleEvent(
      state([], [completed]),
      "realExit",
      tuesday(8),
    );
    expect(result.departureStarted).toBe(true);
    expect(result.state.departure.status).toBe("departed");
    expect(result.state.items).toEqual([completed]);
  });

  test("ENTER after real EXIT closes the departure", () => {
    const departed = applyDepartureLifecycleEvent(
      state([], [carryItem("Keys")]),
      "realExit",
      tuesday(8),
    ).state;
    const entered = applyDepartureLifecycleEvent(
      departed,
      "realEnter",
      tuesday(10),
    );
    expect(entered.departureClosed).toBe(true);
    expect(entered.state.departure).toEqual({
      status: "home",
      departedAt: null,
    });
  });

  test("ENTER without an accepted real EXIT does not clean items", () => {
    const completed = carryItem("Done", { completed: true });
    const initial = state([], [completed]);
    const entered = applyDepartureLifecycleEvent(
      initial,
      "realEnter",
      tuesday(10),
    );
    expect(entered.state).toBe(initial);
    expect(entered.departureClosed).toBe(false);
  });

  test("completed Leaving Home items are cleaned up and incomplete items remain", () => {
    const completed = carryItem("Done", { completed: true });
    const incomplete = carryItem("Still needed");
    const departed = {
      ...state([], [completed, incomplete]),
      departure: {
        status: "departed" as const,
        departedAt: tuesday(8).toISOString(),
      },
    };
    const entered = applyDepartureLifecycleEvent(
      departed,
      "realEnter",
      tuesday(10),
    );
    expect(entered.removedItemIds).toEqual([completed.id]);
    expect(entered.state.items).toEqual([incomplete]);
  });

  test("completed time-triggered items are preserved", () => {
    const timed = carryItem("Timed", {
      completed: true,
      trigger: { type: "time", config: { time: tuesday(12).toISOString() } },
    });
    const departed = {
      ...state([], [timed]),
      departure: {
        status: "departed" as const,
        departedAt: tuesday(8).toISOString(),
      },
    };
    expect(
      applyDepartureLifecycleEvent(departed, "realEnter", tuesday(10)).state.items,
    ).toEqual([timed]);
  });

  test("simulation does not start, close, or clean a real departure", () => {
    const completed = carryItem("Done", { completed: true });
    const initial = {
      ...state([], [completed]),
      departure: {
        status: "departed" as const,
        departedAt: tuesday(7).toISOString(),
      },
    };
    const result = applyDepartureLifecycleEvent(
      initial,
      "simulatedExit",
      tuesday(8),
    );
    expect(result.state).toBe(initial);
    expect(result.departureStarted).toBe(false);
    expect(result.departureClosed).toBe(false);
    expect(result.state.departure.status).toBe("departed");
    expect(result.state.items).toEqual([completed]);
  });

  test("next scheduled occurrence recreates a cleaned Routine item", () => {
    const scheduled = routine("Gym", ["Shoes"], { weekdays: [2, 3] });
    const first = evaluateDueScheduledRoutines(
      state([scheduled]),
      tuesday(8),
      ids(),
    ).state;
    const completed = {
      ...first,
      items: first.items.map((item) => ({ ...item, completed: true })),
      departure: {
        status: "departed" as const,
        departedAt: tuesday(9).toISOString(),
      },
    };
    const closed = applyDepartureLifecycleEvent(
      completed,
      "realEnter",
      tuesday(10),
    ).state;
    expect(closed.items).toEqual([]);

    const wednesday = new Date(2026, 8, 2, 8, 0, 0, 0);
    const next = evaluateDueScheduledRoutines(closed, wednesday, ids());
    expect(next.state.items.map(({ name }) => name)).toEqual(["Shoes"]);
  });
});
