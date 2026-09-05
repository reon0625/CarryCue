import {
  MAX_ITEM_NAME_LENGTH,
  normalizeNewItemName,
} from "@/src/data/itemNames";

describe("new CarryCue item names", () => {
  test("trims whitespace when saving", () => {
    expect(normalizeNewItemName("  Passport  ")).toBe("Passport");
  });

  test("accepts exactly 15 characters", () => {
    const name = "123456789012345";

    expect(name).toHaveLength(MAX_ITEM_NAME_LENGTH);
    expect(normalizeNewItemName(`  ${name}  `)).toBe(name);
  });

  test("rejects input beyond 15 characters", () => {
    expect(normalizeNewItemName("1234567890123456")).toBeNull();
  });

  test("rejects whitespace-only input", () => {
    expect(normalizeNewItemName("   ")).toBeNull();
  });
});
