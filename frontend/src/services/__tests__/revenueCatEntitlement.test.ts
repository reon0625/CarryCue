import type { CustomerInfo } from "react-native-purchases";

import {
  hasPremiumEntitlement,
  tierForCustomerInfo,
} from "@/src/services/revenueCatEntitlement";

function customerInfo(activePremium: boolean): CustomerInfo {
  return {
    entitlements: {
      active: activePremium
        ? { premium: { isActive: true } }
        : {},
    },
  } as unknown as CustomerInfo;
}

describe("RevenueCat entitlement mapping", () => {
  test("active premium entitlement maps to Pro", () => {
    const info = customerInfo(true);
    expect(hasPremiumEntitlement(info)).toBe(true);
    expect(tierForCustomerInfo(info)).toBe("PRO");
  });

  test("missing or expired premium entitlement maps to Free", () => {
    const info = customerInfo(false);
    expect(hasPremiumEntitlement(info)).toBe(false);
    expect(tierForCustomerInfo(info)).toBe("FREE");
  });
});
