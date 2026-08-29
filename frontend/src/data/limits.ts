// Centralized Free/Pro entitlement limits + the copy shown in the mock
// upgrade prompt. No RevenueCat/purchases here — this is the foundation
// that a real paywall will plug into later.

import { EntitlementTier } from "@/src/data/models";

export type Limits = {
  // Total items allowed in the active departure — completed AND incomplete
  // items both count. Completing an item does NOT free up a slot for Free users.
  maxDepartureItems: number;
  maxCustomRoutines: number;
  maxLocations: number;
};

const FREE_LIMITS: Limits = {
  maxDepartureItems: 5,
  maxCustomRoutines: 1,
  maxLocations: 1,
};

const PRO_LIMITS: Limits = {
  maxDepartureItems: Infinity,
  maxCustomRoutines: Infinity,
  maxLocations: Infinity,
};

export function getLimits(tier: EntitlementTier): Limits {
  return tier === "PRO" ? PRO_LIMITS : FREE_LIMITS;
}

export type UpgradeReason = "items" | "routines" | "locations";

export const UPGRADE_COPY: Record<UpgradeReason, { title: string; body: string }> = {
  items: {
    title: "Remember more with CarryCue Pro",
    body: "Free includes up to 5 items per departure.",
  },
  routines: {
    title: "Create unlimited routines with CarryCue Pro",
    body: "Free includes 1 custom routine. Upgrade to create as many as you need.",
  },
  locations: {
    title: "Remember what you need wherever you leave from",
    body: "Free includes 1 location. Upgrade to add more.",
  },
};
