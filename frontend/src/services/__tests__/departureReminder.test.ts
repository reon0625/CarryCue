import { CarryItem, UsageStats, normalizeName } from "@/src/data/models";
import {
  buildDepartureReminder,
  formatDepartureNotificationBody,
  rankDepartureItems,
} from "@/src/services/departureReminder";

function item(
  name: string,
  overrides: Partial<CarryItem> = {},
): CarryItem {
  return {
    id: name,
    name,
    completed: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trigger: { type: "leavingHome" },
    source: "quickAdd",
    ...overrides,
  };
}

function forgotten(
  name: string,
  forgottenCount: number,
  lastForgottenAt: string,
): UsageStats {
  return {
    [normalizeName(name)]: {
      name,
      addedCount: 0,
      forgottenCount,
      lastUsedAt: null,
      lastForgottenAt,
    },
  };
}

describe("departure reminder ranking and formatting", () => {
  test("formats 1 active item", () => {
    expect(buildDepartureReminder([item("Student ID")], {})).toMatchObject({
      title: "Before you go",
      body: "Student ID",
    });
  });

  test("formats 3 active items", () => {
    expect(
      formatDepartureNotificationBody([
        item("Student ID"),
        item("Charger"),
        item("Umbrella"),
      ]),
    ).toBe("Student ID · Charger · Umbrella");
  });

  test("formats 5+ active items with the remaining count", () => {
    const items = ["Student ID", "Charger", "Umbrella", "Keys", "Wallet"].map(
      (name) => item(name),
    );
    expect(buildDepartureReminder(items, {})?.body).toBe(
      "Student ID · Charger · Umbrella +2 more",
    );
  });

  test("a forgotten item ranks above an otherwise equivalent item", () => {
    const items = [item("Charger"), item("Student ID")];
    const stats = forgotten(
      "Student ID",
      1,
      "2026-08-31T00:00:00.000Z",
    );
    expect(rankDepartureItems(items, stats).map(({ name }) => name)).toEqual([
      "Student ID",
      "Charger",
    ]);
  });

  test("more recent forgotten history breaks equal-count ties", () => {
    const items = [item("Umbrella"), item("Charger")];
    const stats: UsageStats = {
      ...forgotten("Umbrella", 1, "2026-01-01T00:00:00.000Z"),
      ...forgotten("Charger", 1, "2026-08-31T00:00:00.000Z"),
    };
    expect(rankDepartureItems(items, stats).map(({ name }) => name)).toEqual([
      "Charger",
      "Umbrella",
    ]);
  });

  test("stronger forgotten history outranks a more recent weaker history", () => {
    const items = [item("Passport"), item("Umbrella")];
    const stats: UsageStats = {
      ...forgotten("Passport", 3, "2026-01-01T00:00:00.000Z"),
      ...forgotten("Umbrella", 1, "2026-08-31T00:00:00.000Z"),
    };
    expect(rankDepartureItems(items, stats).map(({ name }) => name)).toEqual([
      "Passport",
      "Umbrella",
    ]);
  });

  test("a deleted item is excluded even when its forgotten history remains", () => {
    const currentItems = [item("Charger")];
    const stats = forgotten(
      "Deleted Passport",
      10,
      "2026-08-31T00:00:00.000Z",
    );
    expect(rankDepartureItems(currentItems, stats).map(({ name }) => name)).toEqual([
      "Charger",
    ]);
  });

  test("completed and non-departure items are excluded", () => {
    const items = [
      item("Done", { completed: true }),
      item("Timed", { trigger: { type: "time" } }),
      item("Active"),
    ];
    expect(rankDepartureItems(items, {}).map(({ name }) => name)).toEqual([
      "Active",
    ]);
  });

  test("historical forgotten items that are not active are never inserted", () => {
    const stats = forgotten(
      "Passport",
      20,
      "2026-08-31T00:00:00.000Z",
    );
    const reminder = buildDepartureReminder([item("Keys")], stats);
    expect(reminder?.items.map(({ name }) => name)).toEqual(["Keys"]);
    expect(reminder?.body).toBe("Keys");
  });

  test("output is deterministic for identical input", () => {
    const items = [item("Keys"), item("Wallet"), item("Charger")];
    const first = buildDepartureReminder(items, {});
    const second = buildDepartureReminder(items, {});
    expect(second).toEqual(first);
  });
});
