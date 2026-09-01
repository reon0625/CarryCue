import type { CustomerInfo } from "react-native-purchases";

import type { EntitlementTier } from "@/src/data/models";

export const REVENUECAT_ENTITLEMENT_ID = "premium";
export const REVENUECAT_OFFERING_ID = "default";

export function hasPremiumEntitlement(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[REVENUECAT_ENTITLEMENT_ID]?.isActive === true;
}

export function tierForCustomerInfo(customerInfo: CustomerInfo): EntitlementTier {
  return hasPremiumEntitlement(customerInfo) ? "PRO" : "FREE";
}
