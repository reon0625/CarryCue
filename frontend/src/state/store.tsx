import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { storage } from "@/src/utils/storage";

export type Item = { id: string; name: string; done: boolean };
export type Routine = { id: string; name: string; items: Item[] };

type PersistShape = {
  hasLaunched: boolean;
  leaveTime: string;
  items: Item[];
  frequentlyUsed: string[];
  routines: Routine[];
};

const STORAGE_KEY = "carrycue_state_v1";

let counter = 0;
const uid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

const mkItems = (names: string[]): Item[] =>
  names.map((n) => ({ id: uid(), name: n, done: false }));

const initialState: PersistShape = {
  hasLaunched: false,
  leaveTime: "8:30",
  items: mkItems(["Wallet", "Student ID", "Charger", "Umbrella"]),
  frequentlyUsed: ["Wallet", "Keys", "Charger", "Umbrella"],
  routines: [
    { id: uid(), name: "Everyday", items: mkItems(["Wallet", "Keys", "Earbuds"]) },
    { id: uid(), name: "School", items: mkItems(["Student ID", "Laptop", "Charger"]) },
    { id: uid(), name: "Gym", items: mkItems(["Shoes", "Towel", "Bottle"]) },
  ],
};

type StoreValue = PersistShape & {
  hydrated: boolean;
  completeLaunch: () => void;
  addItem: (name: string) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  addFrequent: (name: string) => void;
  applyRoutine: (routineId: string) => void;
  newRoutine: () => string;
  addRoutineItem: (routineId: string, name: string) => void;
  removeRoutineItem: (routineId: string, itemId: string) => void;
  toggleRoutineItem: (routineId: string, itemId: string) => void;
  renameRoutine: (routineId: string, name: string) => void;
  getRoutine: (routineId: string) => Routine | undefined;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistShape>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const raw = await storage.getItem<string | null>(STORAGE_KEY, null);
      if (raw) {
        try {
          const saved = JSON.parse(raw) as PersistShape;
          setState({ ...initialState, ...saved });
        } catch {
          // corrupt payload — fall back to initial state
        }
      }
      loadedRef.current = true;
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const completeLaunch = useCallback(
    () => setState((s) => ({ ...s, hasLaunched: true })),
    [],
  );

  const addItem = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      items: [{ id: uid(), name: trimmed, done: false }, ...s.items],
    }));
  }, []);

  const toggleItem = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      items: s.items.map((it) =>
        it.id === id ? { ...it, done: !it.done } : it,
      ),
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setState((s) => ({ ...s, items: s.items.filter((it) => it.id !== id) }));
  }, []);

  const addFrequent = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => {
      const exists = s.frequentlyUsed.some(
        (f) => f.toLowerCase() === trimmed.toLowerCase(),
      );
      return {
        ...s,
        frequentlyUsed: exists ? s.frequentlyUsed : [trimmed, ...s.frequentlyUsed],
      };
    });
  }, []);

  const applyRoutine = useCallback((routineId: string) => {
    setState((s) => {
      const r = s.routines.find((x) => x.id === routineId);
      if (!r) return s;
      const existingNames = new Set(s.items.map((i) => i.name.toLowerCase()));
      const toAdd = r.items
        .filter((i) => !existingNames.has(i.name.toLowerCase()))
        .map((i) => ({ id: uid(), name: i.name, done: false }));
      return { ...s, items: [...toAdd, ...s.items] };
    });
  }, []);

  const newRoutine = useCallback(() => {
    const id = uid();
    setState((s) => ({
      ...s,
      routines: [...s.routines, { id, name: "New routine", items: [] }],
    }));
    return id;
  }, []);

  const addRoutineItem = useCallback((routineId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      routines: s.routines.map((r) =>
        r.id === routineId
          ? { ...r, items: [...r.items, { id: uid(), name: trimmed, done: false }] }
          : r,
      ),
    }));
  }, []);

  const removeRoutineItem = useCallback((routineId: string, itemId: string) => {
    setState((s) => ({
      ...s,
      routines: s.routines.map((r) =>
        r.id === routineId
          ? { ...r, items: r.items.filter((i) => i.id !== itemId) }
          : r,
      ),
    }));
  }, []);

  const toggleRoutineItem = useCallback((routineId: string, itemId: string) => {
    setState((s) => ({
      ...s,
      routines: s.routines.map((r) =>
        r.id === routineId
          ? {
              ...r,
              items: r.items.map((i) =>
                i.id === itemId ? { ...i, done: !i.done } : i,
              ),
            }
          : r,
      ),
    }));
  }, []);

  const renameRoutine = useCallback((routineId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) => ({
      ...s,
      routines: s.routines.map((r) =>
        r.id === routineId ? { ...r, name: trimmed } : r,
      ),
    }));
  }, []);

  const getRoutine = useCallback(
    (routineId: string) => state.routines.find((r) => r.id === routineId),
    [state.routines],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      hydrated,
      completeLaunch,
      addItem,
      toggleItem,
      removeItem,
      addFrequent,
      applyRoutine,
      newRoutine,
      addRoutineItem,
      removeRoutineItem,
      toggleRoutineItem,
      renameRoutine,
      getRoutine,
    }),
    [
      state,
      hydrated,
      completeLaunch,
      addItem,
      toggleItem,
      removeItem,
      addFrequent,
      applyRoutine,
      newRoutine,
      addRoutineItem,
      removeRoutineItem,
      toggleRoutineItem,
      renameRoutine,
      getRoutine,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
