import { create } from 'zustand';
import type { VentNetwork, VentNode, Airway, Fan } from '../model/types';
import { createDemoNetwork } from '../model/demoNetwork';
import { solveNetwork, type SolveResult } from '../solver';
import type { DisplaySetting } from '../display/variables';

export type Tool = 'select' | 'addNode' | 'addAirway' | 'addFan' | 'addRegulator' | 'pan';

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'airway'; id: string }
  | null;

export interface Scenario {
  id: string;
  name: string;
  network: VentNetwork;
}

interface DisplayState {
  primary: DisplaySetting;
  secondary: DisplaySetting;
}

interface PersistShape {
  scenarios: Scenario[];
  activeScenarioId: string;
  display: DisplayState;
}

const STORAGE_KEY = 'ventsim.model.v1';

interface AppState {
  scenarios: Scenario[];
  activeScenarioId: string;
  selection: Selection;
  tool: Tool;
  /** First node chosen while drawing an airway (addAirway tool). */
  pendingFromNode: string | null;
  result: SolveResult | null;
  resultStale: boolean;
  solveError: string | null;
  display: DisplayState;

  // history (per active network)
  past: VentNetwork[];
  future: VentNetwork[];

  // --- selectors
  activeNetwork: () => VentNetwork;

  // --- tools / selection
  setTool: (tool: Tool) => void;
  setSelection: (s: Selection) => void;
  setPendingFromNode: (id: string | null) => void;

  // --- editing (history-tracked)
  addNode: (x: number, y: number) => void;
  addAirway: (fromId: string, toId: string) => void;
  updateNode: (id: string, patch: Partial<VentNode>) => void;
  updateAirway: (id: string, patch: Partial<Airway>) => void;
  setFan: (airwayId: string, fan: Fan | null) => void;
  deleteSelected: () => void;

  // --- live drag (history captured at drag start)
  beginHistory: () => void;
  moveNodeLive: (id: string, x: number, y: number) => void;

  // --- solve
  runSolve: () => void;

  // --- display
  setPrimaryDisplay: (d: DisplaySetting) => void;
  setSecondaryDisplay: (d: DisplaySetting) => void;

  // --- model lifecycle
  newModel: () => void;
  loadNetwork: (network: VentNetwork, name?: string) => void;

  // --- scenarios
  addScenario: () => void;
  switchScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;

  // --- history
  undo: () => void;
  redo: () => void;
}

function uid(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function uniqueId(existing: Set<string>, prefix: string): string {
  let id = `${prefix}${existing.size + 1}`;
  while (existing.has(id)) id = uid(prefix);
  return id;
}

function loadPersisted(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed.scenarios?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

const defaultDisplay: DisplayState = {
  primary: { variable: 'airflow', unitId: 'm3s' },
  secondary: { variable: 'pressure', unitId: 'pa' },
};

function initialState(): PersistShape {
  const persisted = loadPersisted();
  if (persisted) return persisted;
  const scenario: Scenario = { id: uid('sc'), name: 'Base', network: createDemoNetwork() };
  return { scenarios: [scenario], activeScenarioId: scenario.id, display: defaultDisplay };
}

export const useNetworkStore = create<AppState>((set, get) => {
  const init = initialState();

  /** Replace the active network with `next`, recording history. */
  function commit(next: VentNetwork) {
    const { scenarios, activeScenarioId, past } = get();
    const current = scenarios.find((s) => s.id === activeScenarioId)!.network;
    set({
      past: [...past, clone(current)],
      future: [],
      scenarios: scenarios.map((s) =>
        s.id === activeScenarioId ? { ...s, network: next } : s,
      ),
      resultStale: true,
    });
  }

  /** Replace the active network WITHOUT recording history (live drag). */
  function setActiveNetwork(next: VentNetwork) {
    const { scenarios, activeScenarioId } = get();
    set({
      scenarios: scenarios.map((s) =>
        s.id === activeScenarioId ? { ...s, network: next } : s,
      ),
      resultStale: true,
    });
  }

  return {
    ...init,
    selection: null,
    tool: 'select',
    pendingFromNode: null,
    result: null,
    resultStale: true,
    solveError: null,
    past: [],
    future: [],

    activeNetwork: () => {
      const { scenarios, activeScenarioId } = get();
      return scenarios.find((s) => s.id === activeScenarioId)!.network;
    },

    setTool: (tool) => set({ tool, pendingFromNode: null }),
    setSelection: (selection) => set({ selection }),
    setPendingFromNode: (id) => set({ pendingFromNode: id }),

    addNode: (x, y) => {
      const net = get().activeNetwork();
      const ids = new Set(net.nodes.map((n) => n.id));
      const id = uniqueId(ids, 'N');
      const node: VentNode = { id, label: id, x, y, z: 0 };
      commit({ ...net, nodes: [...net.nodes, node] });
      set({ selection: { type: 'node', id } });
    },

    addAirway: (fromId, toId) => {
      if (fromId === toId) return;
      const net = get().activeNetwork();
      const ids = new Set(net.airways.map((a) => a.id));
      const id = uniqueId(ids, 'A');
      const airway: Airway = {
        id,
        label: id,
        from: fromId,
        to: toId,
        length: 100,
        area: 10,
        perimeter: 12,
        frictionFactor: 0.012, // PLACEHOLDER — verify against a primary source
        type: 'airway',
      };
      commit({ ...net, airways: [...net.airways, airway] });
      set({ selection: { type: 'airway', id }, pendingFromNode: null });
    },

    updateNode: (id, patch) => {
      const net = get().activeNetwork();
      commit({
        ...net,
        nodes: net.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      });
    },

    updateAirway: (id, patch) => {
      const net = get().activeNetwork();
      commit({
        ...net,
        airways: net.airways.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      });
    },

    setFan: (airwayId, fan) => {
      const net = get().activeNetwork();
      commit({
        ...net,
        airways: net.airways.map((a) => (a.id === airwayId ? { ...a, fan } : a)),
      });
    },

    deleteSelected: () => {
      const { selection } = get();
      if (!selection) return;
      const net = get().activeNetwork();
      if (selection.type === 'node') {
        commit({
          nodes: net.nodes.filter((n) => n.id !== selection.id),
          // drop airways touching the removed node
          airways: net.airways.filter(
            (a) => a.from !== selection.id && a.to !== selection.id,
          ),
        });
      } else {
        commit({ ...net, airways: net.airways.filter((a) => a.id !== selection.id) });
      }
      set({ selection: null });
    },

    beginHistory: () => {
      const net = get().activeNetwork();
      set({ past: [...get().past, clone(net)], future: [] });
    },

    moveNodeLive: (id, x, y) => {
      const net = get().activeNetwork();
      setActiveNetwork({
        ...net,
        nodes: net.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
      });
    },

    runSolve: () => {
      const net = get().activeNetwork();
      try {
        const result = solveNetwork(net, { tolerance: 1e-6, maxIterations: 1000 });
        set({ result, resultStale: false, solveError: null });
      } catch (err) {
        set({ solveError: err instanceof Error ? err.message : String(err), result: null });
      }
    },

    setPrimaryDisplay: (primary) =>
      set({ display: { ...get().display, primary } }),
    setSecondaryDisplay: (secondary) =>
      set({ display: { ...get().display, secondary } }),

    newModel: () => {
      const scenario: Scenario = { id: uid('sc'), name: 'Base', network: { nodes: [], airways: [] } };
      set({
        scenarios: [scenario],
        activeScenarioId: scenario.id,
        selection: null,
        result: null,
        resultStale: true,
        solveError: null,
        past: [],
        future: [],
      });
    },

    loadNetwork: (network, name = 'Imported') => {
      const scenario: Scenario = { id: uid('sc'), name, network };
      set({
        scenarios: [scenario],
        activeScenarioId: scenario.id,
        selection: null,
        result: null,
        resultStale: true,
        solveError: null,
        past: [],
        future: [],
      });
    },

    addScenario: () => {
      const { scenarios, activeScenarioId } = get();
      const current = scenarios.find((s) => s.id === activeScenarioId)!;
      const scenario: Scenario = {
        id: uid('sc'),
        name: `${current.name} copy`,
        network: clone(current.network),
      };
      set({
        scenarios: [...scenarios, scenario],
        activeScenarioId: scenario.id,
        past: [],
        future: [],
        result: null,
        resultStale: true,
      });
    },

    switchScenario: (id) =>
      set({
        activeScenarioId: id,
        selection: null,
        past: [],
        future: [],
        result: null,
        resultStale: true,
        solveError: null,
      }),

    renameScenario: (id, name) =>
      set({
        scenarios: get().scenarios.map((s) => (s.id === id ? { ...s, name } : s)),
      }),

    deleteScenario: (id) => {
      const { scenarios, activeScenarioId } = get();
      if (scenarios.length <= 1) return;
      const remaining = scenarios.filter((s) => s.id !== id);
      const nextActive = activeScenarioId === id ? remaining[0].id : activeScenarioId;
      set({
        scenarios: remaining,
        activeScenarioId: nextActive,
        selection: null,
        past: [],
        future: [],
      });
    },

    undo: () => {
      const { past, future } = get();
      if (past.length === 0) return;
      const net = get().activeNetwork();
      const prev = past[past.length - 1];
      set({ past: past.slice(0, -1), future: [clone(net), ...future] });
      setActiveNetwork(prev);
    },

    redo: () => {
      const { past, future } = get();
      if (future.length === 0) return;
      const net = get().activeNetwork();
      const nextNet = future[0];
      set({ past: [...past, clone(net)], future: future.slice(1) });
      setActiveNetwork(nextNet);
    },
  };
});

// --- autosave to localStorage (model + display only) ---
useNetworkStore.subscribe((state) => {
  const data: PersistShape = {
    scenarios: state.scenarios,
    activeScenarioId: state.activeScenarioId,
    display: state.display,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / serialization errors */
  }
});
