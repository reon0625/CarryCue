import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState as NativeAppState, Platform } from "react-native";
import Purchases, { CustomerInfo, LOG_LEVEL } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

import {
  hasPremiumEntitlement,
  REVENUECAT_ENTITLEMENT_ID,
  REVENUECAT_OFFERING_ID,
  tierForCustomerInfo,
} from "@/src/services/revenueCatEntitlement";
import { useStore } from "@/src/state/store";

export type RevenueCatActionResult =
  | { status: "purchased" | "restored" | "already-premium" }
  | { status: "cancelled" | "no-active-purchase" }
  | { status: "error" | "unavailable"; message: string };

type RevenueCatContextValue = {
  configured: boolean;
  busy: boolean;
  lastError: string | null;
  presentPaywall: () => Promise<RevenueCatActionResult>;
  restorePurchases: () => Promise<RevenueCatActionResult>;
};

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

let configurationPromise: Promise<void> | null = null;

function platformApiKey(): string | null {
  const value =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : Platform.OS === "android"
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY;
  return value?.trim() || null;
}

async function ensureRevenueCatConfigured(): Promise<void> {
  if (configurationPromise) return configurationPromise;

  configurationPromise = (async () => {
    const apiKey = platformApiKey();
    if (!apiKey) {
      throw new Error(`RevenueCat ${Platform.OS} public SDK key is not configured.`);
    }
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    if (!(await Purchases.isConfigured())) {
      Purchases.configure({ apiKey });
    }
  })().catch((error) => {
    configurationPromise = null;
    throw error;
  });

  return configurationPromise;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Purchases are temporarily unavailable.";
}

export function RevenueCatProvider({ children }: { children: React.ReactNode }) {
  const { hydrated, setEntitlementFromPurchases } = useStore();
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const applyCustomerInfo = useCallback(
    (customerInfo: CustomerInfo) => {
      setEntitlementFromPurchases(tierForCustomerInfo(customerInfo));
      setLastError(null);
    },
    [setEntitlementFromPurchases],
  );

  const refreshCustomerInfo = useCallback(async () => {
    const customerInfo = await Purchases.getCustomerInfo();
    applyCustomerInfo(customerInfo);
    return customerInfo;
  }, [applyCustomerInfo]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    let listenerAdded = false;

    const customerInfoListener = (customerInfo: CustomerInfo) => {
      if (active) applyCustomerInfo(customerInfo);
    };

    ensureRevenueCatConfigured()
      .then(async () => {
        if (!active) return;
        setConfigured(true);
        Purchases.addCustomerInfoUpdateListener(customerInfoListener);
        listenerAdded = true;
        await refreshCustomerInfo();
      })
      .catch((error) => {
        if (active) setLastError(errorMessage(error));
      });

    const appStateSubscription = NativeAppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState !== "active" || !listenerAdded) return;
        refreshCustomerInfo().catch((error) => {
          if (active) setLastError(errorMessage(error));
        });
      },
    );

    return () => {
      active = false;
      appStateSubscription.remove();
      if (listenerAdded) {
        Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
      }
    };
  }, [applyCustomerInfo, hydrated, refreshCustomerInfo]);

  const presentPaywall = useCallback(async (): Promise<RevenueCatActionResult> => {
    setBusy(true);
    try {
      await ensureRevenueCatConfigured();
      setConfigured(true);
      const offerings = await Purchases.getOfferings();
      const offering = offerings.all[REVENUECAT_OFFERING_ID];
      if (!offering) {
        throw new Error(
          `RevenueCat offering '${REVENUECAT_OFFERING_ID}' is not available.`,
        );
      }

      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: REVENUECAT_ENTITLEMENT_ID,
        offering,
        displayCloseButton: true,
      });
      if (result === PAYWALL_RESULT.CANCELLED) return { status: "cancelled" };
      if (result === PAYWALL_RESULT.ERROR) {
        return { status: "error", message: "The paywall could not be presented." };
      }

      const customerInfo = await refreshCustomerInfo();
      if (!hasPremiumEntitlement(customerInfo)) {
        return {
          status: "error",
          message: `RevenueCat entitlement '${REVENUECAT_ENTITLEMENT_ID}' is not active.`,
        };
      }
      if (result === PAYWALL_RESULT.PURCHASED) return { status: "purchased" };
      if (result === PAYWALL_RESULT.RESTORED) return { status: "restored" };
      if (result === PAYWALL_RESULT.NOT_PRESENTED) return { status: "already-premium" };
      return { status: "error", message: "The paywall could not be presented." };
    } catch (error) {
      const message = errorMessage(error);
      setLastError(message);
      return { status: platformApiKey() ? "error" : "unavailable", message };
    } finally {
      setBusy(false);
    }
  }, [refreshCustomerInfo]);

  const restorePurchases = useCallback(async (): Promise<RevenueCatActionResult> => {
    setBusy(true);
    try {
      await ensureRevenueCatConfigured();
      setConfigured(true);
      const customerInfo = await Purchases.restorePurchases();
      applyCustomerInfo(customerInfo);
      return hasPremiumEntitlement(customerInfo)
        ? { status: "restored" }
        : { status: "no-active-purchase" };
    } catch (error) {
      const message = errorMessage(error);
      setLastError(message);
      return { status: platformApiKey() ? "error" : "unavailable", message };
    } finally {
      setBusy(false);
    }
  }, [applyCustomerInfo]);

  const value = useMemo<RevenueCatContextValue>(
    () => ({ configured, busy, lastError, presentPaywall, restorePurchases }),
    [busy, configured, lastError, presentPaywall, restorePurchases],
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat(): RevenueCatContextValue {
  const value = useContext(RevenueCatContext);
  if (!value) throw new Error("useRevenueCat must be used inside RevenueCatProvider");
  return value;
}
