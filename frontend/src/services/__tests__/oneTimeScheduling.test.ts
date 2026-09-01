import {
  AppState,
  CarryItem,
  OneTimePlan,
} from "@/src/data/models";
import { buildDepartureReminder } from "@/src/services/departureReminder";
import {
  deletePendingOneTimePlan,
  evaluateDueOneTimePlans,
  updatePendingOneTimePlan,
} from "@/src/services/oneTimeScheduling";
import { applyDepartureLifecycleEvent } from "@/src/services/routineScheduling";

const at = (day: number, hour = 9, minute = 0): Date =>
  new Date(2026, 8, day, hour, minute, 0, 0);

function plan(
  name = "Passport",
  overrides: Partial<OneTimePlan> = {},
): OneTimePlan {
  return {
    id: `plan-${name}`,
    name,
    scheduledDate: "2026-09-10",
    prepareTime: "08:00",
    status: "pending",
    consumedAt: null,
    expiredAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function item(name: string, overrides: Partial<CarryItem> = {}): CarryItem {
  return {
    id: `item-${name}`,
    name,
    completed: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    trigger: { type: "leavingHome" },
    source: "quickAdd",
    ...overrides,
  };
}

function state(
  oneTimePlans: OneTimePlan[] = [plan()],
  items: CarryItem[] = [],
  entitlement: "FREE" | "PRO" = "PRO",
): AppState {
  return {
    schemaVersion: 5,
    items,
    routines: [],
    oneTimePlans,
    usageStats: {},
    departure: { status: "home", departedAt: null },
    settings: {
      onboardingCompleted: true,
      leaveTime: "8:30",
      notificationsEnabled: true,
      entitlement,
      locations: [],
    },
  };
}

function ids(): () => string {
  let value = 0;
  return () => `generated-${++value}`;
}

describe("one-time scheduled item evaluation", () => {
  test("future plan does not activate early", () => {
    const initial = state();
    const result = evaluateDueOneTimePlans(initial, at(9, 20), ids());
    expect(result.state).toBe(initial);
    expect(result.state.items).toEqual([]);
  });

  test("due plan activates as one leaving-home item", () => {
    const result = evaluateDueOneTimePlans(state(), at(10, 8), ids());
    expect(result.activatedPlanIds).toEqual(["plan-Passport"]);
    expect(result.state.items).toMatchObject([
      { name: "Passport", completed: false, source: "oneTimePlan", trigger: { type: "leavingHome" } },
    ]);
    expect(result.state.oneTimePlans[0].status).toBe("consumed");
  });

  test("optional time defaults to the start of the selected day", () => {
    const result = evaluateDueOneTimePlans(
      state([plan("Report", { prepareTime: null })]),
      at(10, 0),
      ids(),
    );
    expect(result.state.items[0].name).toBe("Report");
  });

  test("same-day missed time activates on the next evaluation", () => {
    const result = evaluateDueOneTimePlans(state(), at(10, 19), ids());
    expect(result.state.items[0].name).toBe("Passport");
  });

  test("due plan activates only once across repeated foreground evaluations", () => {
    const first = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    const second = evaluateDueOneTimePlans(first, at(10, 10), ids()).state;
    const third = evaluateDueOneTimePlans(second, at(10, 11), ids()).state;
    expect(third.items.filter((candidate) => candidate.name === "Passport")).toHaveLength(1);
  });

  test("restart serialization does not duplicate", () => {
    const activated = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    const reloaded = JSON.parse(JSON.stringify(activated)) as AppState;
    const result = evaluateDueOneTimePlans(reloaded, at(10, 12), ids());
    expect(result.state.items).toHaveLength(1);
    expect(result.activatedPlanIds).toEqual([]);
  });

  test("repeated Home EXIT schedule evaluations do not duplicate", () => {
    const first = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    const afterExit = applyDepartureLifecycleEvent(first, "realExit", at(10, 9, 1)).state;
    const repeated = evaluateDueOneTimePlans(afterExit, at(10, 9, 2), ids()).state;
    expect(repeated.items).toHaveLength(1);
  });

  test("a plan from an older local date expires instead of backfilling", () => {
    const result = evaluateDueOneTimePlans(state(), at(11, 9), ids());
    expect(result.state.items).toEqual([]);
    expect(result.expiredPlanIds).toEqual(["plan-Passport"]);
    expect(result.state.oneTimePlans[0].status).toBe("expired");
  });

  test("normalized active duplicate is not inserted and plan is consumed", () => {
    const result = evaluateDueOneTimePlans(
      state([plan(" Passport ", { id: "plan-Passport" })], [item("passport")]),
      at(10, 9),
      ids(),
    );
    expect(result.state.items).toHaveLength(1);
    expect(result.consumedDuplicatePlanIds).toEqual(["plan-Passport"]);
    expect(result.state.oneTimePlans[0].status).toBe("consumed");
  });

  test("multiple same-name due plans resolve deterministically without duplicates", () => {
    const result = evaluateDueOneTimePlans(
      state([
        plan("Passport", { id: "first" }),
        plan(" passport ", { id: "second" }),
      ]),
      at(10, 9),
      ids(),
    );
    expect(result.state.items).toHaveLength(1);
    expect(result.activatedPlanIds).toEqual(["first"]);
    expect(result.consumedDuplicatePlanIds).toEqual(["second"]);
  });

  test("Free limit leaves a due plan pending instead of losing it", () => {
    const full = ["A", "B", "C", "D", "E"].map((name) => item(name));
    const result = evaluateDueOneTimePlans(state([plan()], full, "FREE"), at(10, 9), ids());
    expect(result.blockedPlanIds).toEqual(["plan-Passport"]);
    expect(result.state.oneTimePlans[0].status).toBe("pending");
    expect(result.state.items).toHaveLength(5);
  });

  test("Free-limit block retries later the same day when a slot is available", () => {
    const full = ["A", "B", "C", "D", "E"].map((name) => item(name));
    const blocked = evaluateDueOneTimePlans(
      state([plan()], full, "FREE"),
      at(10, 9),
      ids(),
    ).state;
    const withSlot = { ...blocked, items: blocked.items.slice(0, 4) };
    const retried = evaluateDueOneTimePlans(withSlot, at(10, 10), ids());
    expect(retried.activatedPlanIds).toEqual(["plan-Passport"]);
    expect(retried.state.items.some((candidate) => candidate.name === "Passport")).toBe(true);
  });

  test("editing before activation changes the schedule", () => {
    const edited = updatePendingOneTimePlan(
      state(),
      "plan-Passport",
      { scheduledDate: "2026-09-12", prepareTime: "15:30" },
      at(9),
    );
    expect(edited.oneTimePlans[0]).toMatchObject({
      scheduledDate: "2026-09-12",
      prepareTime: "15:30",
    });
    expect(evaluateDueOneTimePlans(edited, at(10, 16), ids()).state.items).toEqual([]);
  });

  test("deleting a pending plan prevents future activation", () => {
    const deleted = deletePendingOneTimePlan(state(), "plan-Passport");
    expect(deleted.oneTimePlans).toEqual([]);
    expect(evaluateDueOneTimePlans(deleted, at(10, 9), ids()).state.items).toEqual([]);
  });

  test("activated item participates in the Smart Departure Reminder", () => {
    const activated = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    expect(buildDepartureReminder(activated.items, activated.usageStats)).toMatchObject({
      title: "Before you go",
      body: "Passport",
    });
  });

  test("completed activated item cleans up after real ENTER", () => {
    const activated = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    const departed = applyDepartureLifecycleEvent(activated, "realExit", at(10, 10)).state;
    const completed = {
      ...departed,
      items: departed.items.map((candidate) => ({ ...candidate, completed: true })),
    };
    const entered = applyDepartureLifecycleEvent(completed, "realEnter", at(10, 11));
    expect(entered.state.items).toEqual([]);
    expect(entered.state.oneTimePlans[0].status).toBe("consumed");
  });

  test("incomplete activated item remains after real ENTER", () => {
    const activated = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    const departed = applyDepartureLifecycleEvent(activated, "realExit", at(10, 10)).state;
    const entered = applyDepartureLifecycleEvent(departed, "realEnter", at(10, 11));
    expect(entered.state.items).toHaveLength(1);
  });

  test("consumed plan never recurs after cleanup or a later clock change", () => {
    const activated = evaluateDueOneTimePlans(state(), at(10, 9), ids()).state;
    const departed = applyDepartureLifecycleEvent(activated, "realExit", at(10, 10)).state;
    const completed = {
      ...departed,
      items: departed.items.map((candidate) => ({ ...candidate, completed: true })),
    };
    const cleaned = applyDepartureLifecycleEvent(completed, "realEnter", at(10, 11)).state;
    const later = evaluateDueOneTimePlans(cleaned, at(11, 9), ids()).state;
    const rolledBack = evaluateDueOneTimePlans(later, at(10, 8), ids()).state;
    expect(rolledBack.items).toEqual([]);
  });

  test("Simulate Home Exit lifecycle is non-destructive and does not consume plans", () => {
    const initial = state();
    const simulated = applyDepartureLifecycleEvent(initial, "simulatedExit", at(10, 9));
    expect(simulated.state).toBe(initial);
    expect(simulated.state.oneTimePlans[0].status).toBe("pending");
  });
});
