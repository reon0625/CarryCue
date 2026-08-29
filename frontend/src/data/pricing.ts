// Centralized CarryCue Pro pricing configuration. UI should always read from
// here instead of hard-coding prices — RevenueCat/store pricing will
// replace or reference these values later.

export type PricingRegion = "japan" | "international";

export type RegionPricing = {
  currency: string;
  monthly: number;
  annual: number;
  lifetime: number;
};

export const PRICING: Record<PricingRegion, RegionPricing> = {
  japan: { currency: "JPY", monthly: 300, annual: 1800, lifetime: 3980 },
  international: { currency: "USD", monthly: 2.99, annual: 14.99, lifetime: 34.99 },
};

// Applies to the annual plan in both regions.
export const ANNUAL_TRIAL_DAYS = 7;

export function getPricing(region: PricingRegion = "international"): RegionPricing {
  return PRICING[region];
}
