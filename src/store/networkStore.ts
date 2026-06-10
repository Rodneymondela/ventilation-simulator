import { create } from 'zustand';
import type { VentNetwork, VentNode, Airway, Fan, Stage, SimSettings, ReferenceLine } from '../model/types';
import { stageView, inStage, MAX_STAGES, DEFAULT_SIM_SETTINGS } from '../model/types';
import { createDemoNetwork } from '../model/demoNetwork';
import { solveNetwork, solveContaminant, solveHeat, type SolveResult, type HeatResult } from '../solver';
import { formatValue, type DisplaySetting } from '../display/variables';
import { DEFAULT_GLYPHS, type GlyphKind } from '../display/glyphs';

export type Tool = 'select' | 'addNode' | 'addAirway' | 'addFan' | 'addRegulator' | 'pan';

export type ViewMode = '2d' | '3d';

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'airway'; id: string }
  | null;

interface DisplayState {
  primary: DisplaySetting;
  secondary: DisplaySetting;
}

/**
 * Persisted model document. The network is a single shared POOL; `stages` lists
 * the named stages and each node/airway references stages via its `stages`
 * membership. Bumped to v2 when the old independent-"scenario" model was
 * replaced by the Ventsim shared-airway staging model.
 */
interface PersistShape {
  network: VentNetwork;
  stages: Stage[];
  activeStageId: string;
  display: DisplayState;
  simSettings: SimSettings;
  glyphs: Record<GlyphKind, boolean>;
  referenceLines: ReferenceLine[];
}

const STORAGE_KEY = 'ventsim.model.v2';
const LEGACY_STORAGE_KEY = 'ventsim.model.v1';

interface AppState {
  /** Single shared pool of nodes + airways across all stages. */
  network: VentNetwork;
  stages: Stage[];
  activeStageId: string;
  selection: Selection;
  /** Airway ids highlighted as a group by the "select same layer" helper. */
  selectedAirways: string[];
  tool: Tool;
  viewMode: ViewMode;
  /** First node chosen while drawing an airway (addAirway tool). */
  pendingFromNode: string | null;
  result: SolveResult | null;
  resultStale: boolean;
  solveError: string | null;
  /** Whether the last solve's contaminant transport converged (null = not run). */
  contaminantConverged: boolean | null;
  /** Result of the thermodynamic (heat) march, or null if not run. */
  heatResult: HeatResult | null;
  /** Whether the last heat march converged (null = not run). */
  heatConverged: boolean | null;
  display: DisplayState;
  simSettings: SimSettings;
  /** Which status-glyph layers are visible on the canvas. */
  glyphs: Record<GlyphKind, boolean>;
  /** Imported DXF reference geometry drawn faintly behind the network (view-only). */
  referenceLines: ReferenceLine[];

  // history (snapshots of the pooled network)
  past: VentNetwork[];
  future: VentNetwork[];

  // --- selectors
  /** Filtered view of the pool for the active stage (what is shown/solved). */
  activeNetwork: () => VentNetwork;
  activeStage: () => Stage;

  // --- tools / selection
  setTool: (tool: Tool) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelection: (s: Selection) => void;
  setPendingFromNode: (id: string | null) => void;
  /** Select every airway sharing the selected airway's primary/secondary layer value. */
  selectSameLayer: (which: 'primary' | 'secondary') => void;

  // --- editing (history-tracked, operate on the pool)
  addNode: (x: number, y: number) => void;
  addAirway: (fromId: string, toId: string) => void;
  updateNode: (id: string, patch: Partial<VentNode>) => void;
  updateAirway: (id: string, patch: Partial<Airway>) => void;
  setFan: (airwayId: string, fan: Fan | null) => void;
  setAirwayStages: (airwayId: string, stageIds: string[]) => void;
  deleteSelected: () => void;

  // --- live drag (history captured at drag start)
  beginHistory: () => void;
  moveNodeLive: (id: string, x: number, y: number) => void;

  // --- solve
  runSolve: () => void;

  // --- display
  setPrimaryDisplay: (d: DisplaySetting) => void;
  setSecondaryDisplay: (d: DisplaySetting) => void;

  // --- simulation settings
  setSimSettings: (patch: Partial<SimSettings>) => void;

  // --- glyph layers
  toggleGlyph: (kind: GlyphKind) => void;

  // --- model lifecycle
  newModel: () => void;
  loadModel: (network: VentNetwork, stages?: Stage[], simSettings?: SimSettings) => void;

  // --- DXF import
  /** Store imported centrelines as view-only reference geometry (merge or replace). */
  applyDxfReference: (lines: ReferenceLine[], mode: 'merge' | 'replace') => void;
  /** Add imported airways to the model (merge appends with fresh ids; replace loads fresh). */
  applyDxfAirways: (net: VentNetwork, mode: 'merge' | 'replace') => void;
  /** Clear all imported reference geometry. */
  clearReferenceLines: () => void;

  // --- stages
  addStage: () => void;
  duplicateStage: () => void;
  switchStage: (id: string) => void;
  renameStage: (id: string, name: string) => void;
  deleteStage: (id: string) => void;

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

/** Stamp every node/airway in a network with `[stageId]` membership. */
function stampStage(network: VentNetwork, stageId: string): VentNetwork {
  return {
    nodes: network.nodes.map((n) => ({ ...n, stages: [stageId] })),
    airways: network.airways.map((a) => ({ ...a, stages: [stageId] })),
  };
}

/**
 * Concrete stage membership of an item: its explicit list, or — if ubiquitous
 * (undefined/empty) — all current stage ids.
 */
function materialize(itemStages: string[] | undefined, allStageIds: string[]): string[] {
  return itemStages && itemStages.length > 0 ? itemStages : [...allStageIds];
}

/** Build the initial Base stage from the demo network. */
function freshModel(network: VentNetwork): PersistShape {
  const stage: Stage = { id: uid('st'), name: 'Base' };
  return {
    network: stampStage(network, stage.id),
    stages: [stage],
    activeStageId: stage.id,
    display: defaultDisplay,
    simSettings: { ...DEFAULT_SIM_SETTINGS },
    glyphs: { ...DEFAULT_GLYPHS },
    referenceLines: [],
  };
}

function loadPersisted(): PersistShape | null {
  // Prefer the current v2 shape.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed.network?.nodes && parsed.stages?.length) {
        // simSettings / glyphs were added after v2 shipped — backfill defaults if absent.
        return {
          ...parsed,
          simSettings: { ...DEFAULT_SIM_SETTINGS, ...parsed.simSettings },
          glyphs: { ...DEFAULT_GLYPHS, ...parsed.glyphs },
          referenceLines: parsed.referenceLines ?? [],
        };
      }
    }
  } catch {
    /* fall through to migration / demo */
  }
  // Migrate the legacy v1 "scenarios" shape: take the active (or first)
  // scenario's network as the pool and wrap it in a single Base stage.
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const old = JSON.parse(raw) as {
        scenarios?: { id: string; name: string; network: VentNetwork }[];
        activeScenarioId?: string;
        display?: DisplayState;
      };
      const sc =
        old.scenarios?.find((s) => s.id === old.activeScenarioId) ?? old.scenarios?.[0];
      if (sc?.network?.nodes) {
        const stage: Stage = { id: uid('st'), name: sc.name || 'Base' };
        return {
          network: stampStage(sc.network, stage.id),
          stages: [stage],
          activeStageId: stage.id,
          display: old.display ?? defaultDisplay,
          simSettings: { ...DEFAULT_SIM_SETTINGS },
          glyphs: { ...DEFAULT_GLYPHS },
          referenceLines: [],
        };
      }
    }
  } catch {
    /* fall through to demo */
  }
  return null;
}

const defaultDisplay: DisplayState = {
  primary: { variable: 'airflow', unitId: 'm3s' },
  secondary: { variable: 'pressure', unitId: 'pa' },
};

function initialState(): PersistShape {
  return loadPersisted() ?? freshModel(createDemoNetwork());
}

export const useNetworkStore = create<AppState>((set, get) => {
  const init = initialState();

  /** Replace the pooled network with `next`, recording history. */
  function commit(next: VentNetwork) {
    set({
      past: [...get().past, clone(get().network)],
      future: [],
      network: next,
      resultStale: true,
    });
  }

  // Memoised stage view: stageView() builds a NEW object each call, which would
  // make the `activeNetwork()` selector return a fresh reference every render and
  // send useShallow consumers into an infinite update loop. Cache on the (network,
  // stageId) identity — `network` is replaced by reference on every edit.
  let viewCache: { net: VentNetwork; stageId: string; view: VentNetwork } | null = null;
  function activeNetworkMemo(): VentNetwork {
    const net = get().network;
    const stageId = get().activeStageId;
    if (viewCache && viewCache.net === net && viewCache.stageId === stageId) return viewCache.view;
    const view = stageView(net, stageId);
    viewCache = { net, stageId, view };
    return view;
  }

  /** Replace the pooled network WITHOUT recording history (live drag). */
  function setPool(next: VentNetwork) {
    set({ network: next, resultStale: true });
  }

  return {
    ...init,
    selection: null,
    selectedAirways: [],
    tool: 'select',
    viewMode: '2d',
    pendingFromNode: null,
    result: null,
    resultStale: true,
    solveError: null,
    contaminantConverged: null,
    heatResult: null,
    heatConverged: null,
    past: [],
    future: [],

    activeNetwork: activeNetworkMemo,
    activeStage: () => {
      const { stages, activeStageId } = get();
      return stages.find((s) => s.id === activeStageId) ?? stages[0];
    },

    setTool: (tool) => set({ tool, pendingFromNode: null }),
    setViewMode: (viewMode) => set({ viewMode }),
    // Picking a different element clears any "select same" group highlight.
    setSelection: (selection) => set({ selection, selectedAirways: [] }),
    setPendingFromNode: (id) => set({ pendingFromNode: id }),

    selectSameLayer: (which) => {
      const { selection, result, display } = get();
      if (selection?.type !== 'airway' || !result) return;
      const setting = which === 'primary' ? display.primary : display.secondary;
      const anchor = result.airwayResults.find((r) => r.airwayId === selection.id);
      if (!anchor) return;
      // Match on the value as DISPLAYED (unit + decimals), so "same" means what the
      // user sees in that layer rather than a brittle float comparison.
      const key = formatValue(setting, anchor);
      const ids = result.airwayResults
        .filter((r) => formatValue(setting, r) === key)
        .map((r) => r.airwayId);
      set({ selectedAirways: ids });
    },

    addNode: (x, y) => {
      const { network, activeStageId } = get();
      const ids = new Set(network.nodes.map((n) => n.id));
      const id = uniqueId(ids, 'N');
      const node: VentNode = { id, label: id, x, y, z: 0, stages: [activeStageId] };
      commit({ ...network, nodes: [...network.nodes, node] });
      set({ selection: { type: 'node', id }, selectedAirways: [] });
    },

    addAirway: (fromId, toId) => {
      if (fromId === toId) return;
      const { network, activeStageId } = get();
      const ids = new Set(network.airways.map((a) => a.id));
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
        stages: [activeStageId],
      };
      commit({ ...network, airways: [...network.airways, airway] });
      set({ selection: { type: 'airway', id }, pendingFromNode: null, selectedAirways: [] });
    },

    updateNode: (id, patch) => {
      const { network } = get();
      commit({
        ...network,
        nodes: network.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      });
    },

    // Edits a pooled airway by id → reflected in EVERY stage it belongs to.
    updateAirway: (id, patch) => {
      const { network } = get();
      commit({
        ...network,
        airways: network.airways.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      });
    },

    setFan: (airwayId, fan) => {
      const { network } = get();
      commit({
        ...network,
        airways: network.airways.map((a) => (a.id === airwayId ? { ...a, fan } : a)),
      });
    },

    // Set explicit stage membership for an airway (must belong to ≥1 stage).
    setAirwayStages: (airwayId, stageIds) => {
      if (stageIds.length === 0) return;
      const { network, stages } = get();
      const valid = stageIds.filter((id) => stages.some((s) => s.id === id));
      if (valid.length === 0) return;
      commit({
        ...network,
        airways: network.airways.map((a) => (a.id === airwayId ? { ...a, stages: valid } : a)),
      });
    },

    deleteSelected: () => {
      const { selection, network, stages, activeStageId } = get();
      if (!selection) return;
      if (selection.type === 'node') {
        // Removing a junction removes it and every airway touching it (all stages).
        commit({
          nodes: network.nodes.filter((n) => n.id !== selection.id),
          airways: network.airways.filter(
            (a) => a.from !== selection.id && a.to !== selection.id,
          ),
        });
      } else {
        // Removing an airway drops it from the ACTIVE stage only; if no stage
        // membership remains, it leaves the pool entirely.
        const allIds = stages.map((s) => s.id);
        const airways = network.airways
          .map((a) => {
            if (a.id !== selection.id) return a;
            const remaining = materialize(a.stages, allIds).filter((id) => id !== activeStageId);
            return { ...a, stages: remaining };
          })
          .filter((a) => !(a.id === selection.id && (a.stages?.length ?? 0) === 0));
        commit({ ...network, airways });
      }
      set({ selection: null, selectedAirways: [] });
    },

    beginHistory: () => {
      set({ past: [...get().past, clone(get().network)], future: [] });
    },

    moveNodeLive: (id, x, y) => {
      const { network } = get();
      setPool({
        ...network,
        nodes: network.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
      });
    },

    runSolve: () => {
      const net = get().activeNetwork();
      const s = get().simSettings;
      try {
        const result = solveNetwork(net, {
          tolerance: s.tolerance,
          maxIterations: s.maxIterations,
          referenceDensity: s.referenceDensity,
          airDensity: s.airDensity,
          naturalVentilation: s.naturalVentilation,
          gravity: s.gravity,
        });
        const hasContaminant = net.nodes.some(
          (n) => n.contaminantConcentration != null || n.contaminantInjection != null,
        );
        let contaminantConverged: boolean | null = null;
        if (hasContaminant) {
          const c = solveContaminant(net, result.flows);
          contaminantConverged = c.converged;
          result.airwayResults = result.airwayResults.map((r) => ({
            ...r,
            concentration: c.airwayConcentration[r.airwayId] ?? 0,
          }));
        }

        // Thermodynamic march: runs on the solved airflow, merging each airway's
        // outlet air state onto its result so the heat display layers can read it.
        let heatResult: HeatResult | null = null;
        let heatConverged: boolean | null = null;
        if (s.simulateHeat) {
          heatResult = solveHeat(net, result.flows, {
            intakeDryBulb: s.intakeDryBulb,
            intakeWetBulb: s.intakeWetBulb,
            pressure: s.barometricPressure,
            gravity: s.gravity,
            airDensity: s.airDensity,
          });
          heatConverged = heatResult.converged;
          result.airwayResults = result.airwayResults.map((r) => {
            const out = heatResult!.airwayStates[r.airwayId]?.outlet;
            return out
              ? { ...r, dryBulb: out.dryBulb, wetBulb: out.wetBulb, relHum: out.relHum, sigmaHeat: out.sigmaHeat }
              : r;
          });
        }
        set({
          result,
          resultStale: false,
          solveError: null,
          contaminantConverged,
          heatResult,
          heatConverged,
          selectedAirways: [],
        });
      } catch (err) {
        set({ solveError: err instanceof Error ? err.message : String(err), result: null });
      }
    },

    setPrimaryDisplay: (primary) => set({ display: { ...get().display, primary } }),
    setSecondaryDisplay: (secondary) => set({ display: { ...get().display, secondary } }),

    // Changing a sim setting invalidates the current result (it must be re-solved).
    setSimSettings: (patch) =>
      set({ simSettings: { ...get().simSettings, ...patch }, resultStale: true }),

    // Pure view toggle — does not affect the solve.
    toggleGlyph: (kind) =>
      set({ glyphs: { ...get().glyphs, [kind]: !get().glyphs[kind] } }),

    newModel: () => {
      const stage: Stage = { id: uid('st'), name: 'Base' };
      set({
        network: { nodes: [], airways: [] },
        stages: [stage],
        activeStageId: stage.id,
        selection: null,
        selectedAirways: [],
        result: null,
        resultStale: true,
        solveError: null,
        past: [],
        future: [],
      });
    },

    loadModel: (network, importedStages, importedSettings) => {
      // Use the imported stages if present; otherwise wrap everything in a Base stage.
      let stages: Stage[];
      let pool: VentNetwork;
      if (importedStages && importedStages.length > 0) {
        stages = importedStages;
        pool = network;
      } else {
        const stage: Stage = { id: uid('st'), name: 'Base' };
        stages = [stage];
        pool = stampStage(network, stage.id);
      }
      set({
        network: pool,
        stages,
        activeStageId: stages[0].id,
        // Imported settings win; otherwise keep the current ones (back-fill missing keys).
        simSettings: { ...DEFAULT_SIM_SETTINGS, ...get().simSettings, ...importedSettings },
        selection: null,
        selectedAirways: [],
        result: null,
        resultStale: true,
        solveError: null,
        past: [],
        future: [],
      });
    },

    applyDxfReference: (lines, mode) =>
      set({ referenceLines: mode === 'replace' ? lines : [...get().referenceLines, ...lines] }),

    applyDxfAirways: (net, mode) => {
      if (mode === 'replace') {
        get().loadModel(net);
        return;
      }
      // Merge: remap imported ids to fresh unique ones, stamp into the active stage,
      // and record history so the import can be undone.
      const { network, activeStageId } = get();
      const nodeIds = new Set(network.nodes.map((n) => n.id));
      const airwayIds = new Set(network.airways.map((a) => a.id));
      const idMap = new Map<string, string>();
      const newNodes: VentNode[] = net.nodes.map((n) => {
        const id = uniqueId(nodeIds, 'N');
        nodeIds.add(id);
        idMap.set(n.id, id);
        return { ...n, id, label: n.label === n.id ? id : n.label, stages: [activeStageId] };
      });
      const newAirways: Airway[] = net.airways.map((a) => {
        const id = uniqueId(airwayIds, 'A');
        airwayIds.add(id);
        return {
          ...a,
          id,
          from: idMap.get(a.from) ?? a.from,
          to: idMap.get(a.to) ?? a.to,
          stages: [activeStageId],
        };
      });
      commit({ nodes: [...network.nodes, ...newNodes], airways: [...network.airways, ...newAirways] });
    },

    clearReferenceLines: () => set({ referenceLines: [] }),

    addStage: () => {
      const { stages } = get();
      if (stages.length >= MAX_STAGES) return;
      const stage: Stage = { id: uid('st'), name: `Stage ${stages.length + 1}` };
      // A brand-new stage is empty: existing items carry explicit membership that
      // does not include it. Switching clears results (no auto-resim).
      set({
        stages: [...stages, stage],
        activeStageId: stage.id,
        selection: null,
        selectedAirways: [],
        result: null,
        resultStale: true,
        past: [],
        future: [],
      });
    },

    duplicateStage: () => {
      const { stages, activeStageId, network } = get();
      if (stages.length >= MAX_STAGES) return;
      const source = stages.find((s) => s.id === activeStageId) ?? stages[0];
      const stage: Stage = { id: uid('st'), name: `${source.name} copy` };
      const allIds = [...stages.map((s) => s.id), stage.id];
      // Every item visible in the source stage joins the new stage too, so they
      // become SHARED between the two (edits propagate to both).
      const addToStage = <T extends { stages?: string[] }>(item: T): T =>
        inStage(item, activeStageId)
          ? { ...item, stages: Array.from(new Set([...materialize(item.stages, allIds), stage.id])) }
          : item;
      set({
        network: {
          nodes: network.nodes.map(addToStage),
          airways: network.airways.map(addToStage),
        },
        stages: [...stages, stage],
        activeStageId: stage.id,
        selection: null,
        selectedAirways: [],
        result: null,
        resultStale: true,
        past: [],
        future: [],
      });
    },

    switchStage: (id) =>
      set({
        activeStageId: id,
        selection: null,
        selectedAirways: [],
        past: [],
        future: [],
        result: null, // no auto-resim on stage switch — require an explicit solve
        resultStale: true,
        solveError: null,
      }),

    renameStage: (id, name) =>
      set({ stages: get().stages.map((s) => (s.id === id ? { ...s, name } : s)) }),

    deleteStage: (id) => {
      const { stages, activeStageId, network } = get();
      if (stages.length <= 1) return;
      const remaining = stages.filter((s) => s.id !== id);
      const remainingIds = remaining.map((s) => s.id);
      // Remove the stage from every item; drop items left with no stage at all.
      const dropStage = <T extends { stages?: string[] }>(item: T): T | null => {
        if (!item.stages || item.stages.length === 0) return item; // ubiquitous: unaffected
        const next = item.stages.filter((sid) => sid !== id);
        return next.length === 0 ? null : { ...item, stages: next };
      };
      const nodes = network.nodes.map(dropStage).filter((n): n is VentNode => n !== null);
      const airways = network.airways.map(dropStage).filter((a): a is Airway => a !== null);
      // Prune airways whose endpoints were removed.
      const nodeIds = new Set(nodes.map((n) => n.id));
      const keptAirways = airways.filter((a) => nodeIds.has(a.from) && nodeIds.has(a.to));
      set({
        network: { nodes, airways: keptAirways },
        stages: remaining,
        activeStageId: activeStageId === id ? remainingIds[0] : activeStageId,
        selection: null,
        selectedAirways: [],
        result: null,
        resultStale: true,
        past: [],
        future: [],
      });
    },

    undo: () => {
      const { past, network } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({ past: past.slice(0, -1), future: [clone(network), ...get().future], resultStale: true });
      set({ network: prev });
    },

    redo: () => {
      const { future, network } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({ past: [...get().past, clone(network)], future: future.slice(1), resultStale: true });
      set({ network: next });
    },
  };
});

// --- autosave to localStorage (model + stages + display only) ---
useNetworkStore.subscribe((state) => {
  const data: PersistShape = {
    network: state.network,
    stages: state.stages,
    activeStageId: state.activeStageId,
    display: state.display,
    simSettings: state.simSettings,
    glyphs: state.glyphs,
    referenceLines: state.referenceLines,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / serialization errors */
  }
});
