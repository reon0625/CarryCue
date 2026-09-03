import { AppState } from "@/src/data/models";
import { normalizePersistedState } from "@/src/data/repository";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe("STEP 6/6.5 persisted-state migration", () => {
  test("existing users receive disabled schedule and safe home lifecycle defaults", () => {
    const legacy = {
      schemaVersion: 3,
      items: [],
      routines: [
        {
          id: "existing-routine",
          name: "University",
          items: [],
          isSeed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      usageStats: {},
      settings: {
        onboardingCompleted: true,
        leaveTime: "8:30",
        notificationsEnabled: true,
        entitlement: "FREE",
        locations: [],
      },
    } as unknown as Partial<AppState>;

    const migrated = normalizePersistedState(legacy);

    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.routines[0].schedule).toEqual({
      enabled: false,
      weekdays: [1, 2, 3, 4, 5],
      prepareTime: "07:30",
      lastPreparedOccurrenceKey: null,
    });
    expect(migrated.departure).toEqual({
      status: "home",
      departedAt: null,
    });
    expect(migrated.oneTimePlans).toEqual([]);
  });

  test("schema-v4 users receive an empty one-time plan collection", () => {
    const migrated = normalizePersistedState({
      schemaVersion: 4,
      items: [],
      routines: [],
      usageStats: {},
      departure: { status: "home", departedAt: null },
    });

    expect(migrated.schemaVersion).toBe(5);
    expect(migrated.oneTimePlans).toEqual([]);
  });

  test("schema-v5 one-time plan state survives normalization", () => {
    const persistedAt = "2026-09-01T00:00:00.000Z";
    const migrated = normalizePersistedState({
      schemaVersion: 5,
      items: [],
      routines: [],
      oneTimePlans: [
        {
          id: "plan-1",
          name: "Passport",
          scheduledDate: "2026-09-10",
          prepareTime: "08:15",
          status: "pending",
          consumedAt: null,
          expiredAt: null,
          createdAt: persistedAt,
          updatedAt: persistedAt,
        },
      ],
      usageStats: {},
      departure: { status: "home", departedAt: null },
    });

    expect(migrated.oneTimePlans).toEqual([
      expect.objectContaining({
        id: "plan-1",
        scheduledDate: "2026-09-10",
        prepareTime: "08:15",
        status: "pending",
      }),
    ]);
  });

  test("legacy arriving-place items are preserved and fall back to Leaving home", () => {
    const persistedAt = "2026-09-01T00:00:00.000Z";
    const legacy = {
      schemaVersion: 5,
      items: [
        {
          id: "legacy-arrival-item",
          name: "Gym shoes",
          completed: false,
          createdAt: persistedAt,
          updatedAt: persistedAt,
          trigger: {
            type: "arrivingPlace",
            config: { placeName: "Gym" },
          },
          source: "quickAdd",
        },
      ],
      routines: [],
      oneTimePlans: [],
      usageStats: {},
      departure: { status: "home", departedAt: null },
    } as unknown as Partial<AppState>;

    const migrated = normalizePersistedState(legacy);

    expect(migrated.items).toHaveLength(1);
    expect(migrated.items[0]).toEqual({
      id: "legacy-arrival-item",
      name: "Gym shoes",
      completed: false,
      createdAt: persistedAt,
      updatedAt: persistedAt,
      trigger: {
        type: "leavingHome",
        config: { placeName: "Gym" },
      },
      source: "quickAdd",
    });
  });
});
