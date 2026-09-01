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

describe("STEP 6 persisted-state migration", () => {
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

    expect(migrated.schemaVersion).toBe(4);
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
  });
});
