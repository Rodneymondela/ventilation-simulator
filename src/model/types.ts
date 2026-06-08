/**
 * Core data model for the mine ventilation network.
 *
 * Units are SI throughout the solver:
 *   length  m
 *   area    m^2
 *   flow Q  m^3/s
 *   pressure Pa
 *   resistance R  Pa·s^2/m^6   (so that p = R·Q^2)
 *
 * NOTE on constants: the Atkinson friction factor `k` and air density are
 * EMPIRICAL and vary by airway type / conditions. They are kept as editable
 * inputs with placeholder defaults that must be VERIFIED against a primary
 * source (e.g. McPherson, *Subsurface Ventilation Engineering*) before any
 * results are trusted for real engineering.
 */

/** A junction in the network. z is depth/elevation (used later for NVP). */
export interface VentNode {
  id: string;
  label?: string;
  x: number;
  y: number;
  z: number;
  /**
   * IDs of the stages this node belongs to. Undefined or empty means the node is
   * present in EVERY stage (ubiquitous) — the default for imported/legacy data.
   * A node is also shown in a stage if any airway visible in that stage touches
   * it, so endpoints are never dangling.
   */
  stages?: string[];
  /**
   * Optional fixed (boundary) pressure in Pa, e.g. a surface/atmosphere
   * connection. `null`/undefined means it is a free internal junction whose
   * pressure is solved. (Boundary handling is added at the network stage; the
   * baseline loop solver treats the network as closed.)
   */
  fixedPressure?: number | null;

  /**
   * Optional fixed contaminant concentration (arbitrary units, e.g. a fresh-air
   * intake at 0, or a held source concentration). When set, this node's
   * concentration is clamped to this value in the transport solve.
   * APPROXIMATE — not a validated occupational-exposure model.
   */
  contaminantConcentration?: number | null;

  /**
   * Optional contaminant mass-injection rate at this node (units·m³/s, i.e.
   * concentration × flow). Added to the node's contaminant balance.
   */
  contaminantInjection?: number | null;
}

/** One (pressure, flow) sample of a fan characteristic curve. */
export interface FanCurvePoint {
  /** Flow, m^3/s */
  q: number;
  /** Pressure rise, Pa */
  p: number;
}

/** A fan attached to an airway. Curve is interpolated piecewise-linearly. */
export interface Fan {
  id: string;
  name?: string;
  /** Characteristic curve points; need not be pre-sorted. */
  curve: FanCurvePoint[];
  /**
   * Switched off: the fan stays attached (and editable) but contributes no
   * pressure to the solve, so the branch behaves as a plain airway. Reported
   * fan state is then "off".
   */
  off?: boolean;
}

/** A branch connecting two nodes (a drift / roadway / shaft). */
export interface Airway {
  id: string;
  label?: string;
  from: string;
  to: string;
  /** Length L, m */
  length: number;
  /** Cross-sectional area A, m^2 */
  area: number;
  /** Perimeter O, m */
  perimeter: number;
  /** Atkinson friction factor k (empirical — verify against a primary source). */
  frictionFactor: number;
  /** Extra resistance from a regulator/damper, Pa·s^2/m^6. */
  regulatorResistance?: number;
  /** Optional fan on this branch (boost in the from->to direction). */
  fan?: Fan | null;
  /** Free-text airway type label (e.g. "intake", "return", "shaft"). */
  type?: string;
  /**
   * IDs of the stages this airway belongs to. Undefined or empty means the
   * airway is present in EVERY stage (ubiquitous). An airway shared across
   * stages reflects edits everywhere it appears (single pooled object); a
   * stage-unique airway carries just one stage id, so edits do not leak.
   */
  stages?: string[];
  /**
   * Atkinson pressure-loss exponent n in p = R·Q^n. Defaults to 2 (fully
   * turbulent square law). Set toward 1 to model laminar, low-velocity airways
   * (p ∝ Q). In Ventsim this exponent rides on the airway's air type; here it
   * is a per-airway value. Clamped to [1, 2] by the solver.
   */
  flowExponent?: number;
  /**
   * If set, this resistance (Pa·s^2/m^6) is used INSTEAD of the Atkinson
   * geometric calculation. Useful for tests and manually-specified branches.
   * The regulator resistance (if any) is still added on top.
   */
  resistanceOverride?: number | null;
  /**
   * Operating air density in this airway, kg/m^3. When set it is used (instead
   * of the model-wide operating density) both to adjust this airway's
   * resistance away from the reference density and as the column density for
   * natural ventilation pressure. Leave undefined to inherit the model setting.
   */
  airDensity?: number;
  /**
   * Ventsim "already density-adjusted" flag. When true the resistance is treated
   * as already standing at local density, so the reference→local density scaling
   * is skipped for this airway. NVP is unaffected by this flag.
   */
  densityAdjusted?: boolean;
  /**
   * Sealed/blocked airway: carries no air. The solver excludes it from the
   * network entirely and reports Q = 0. Blocking overrides any fixed flow.
   */
  blocked?: boolean;
  /**
   * Fixed-quantity airway: a flow controller (booster/regulator) holds the flow
   * in the from->to direction at this value, m^3/s. The solver reports the
   * controller pressure required. Requires the airway to sit in a surrounding
   * circuit (it cannot be the only path between its nodes).
   */
  fixedFlow?: number | null;
}

export interface VentNetwork {
  nodes: VentNode[];
  airways: Airway[];
}

/**
 * A named stage (Ventsim staging model): a mine-timeline phase OR an alternative
 * design option. Up to {@link MAX_STAGES} per model. Airways/nodes reference
 * stages by id via their `stages` membership; the network itself is a single
 * shared pool, and each stage is a filtered view of it.
 */
export interface Stage {
  id: string;
  name: string;
}

/** Ventsim supports up to 24 stages in one model file. */
export const MAX_STAGES = 24;

/**
 * Whole-model simulation settings (the Ventsim "simulation accuracy" /
 * air-property settings). All values are EDITABLE — the density defaults follow
 * the Ventsim 1.2 kg/m^3 reference convention but must be verified before any
 * result is trusted for real engineering.
 */
export interface SimSettings {
  /** Reference air density that friction factors / resistances are standardised to, kg/m^3. */
  referenceDensity: number;
  /** Model-wide operating (local) air density used where an airway sets none, kg/m^3. */
  airDensity: number;
  /** Natural ventilation pressure from air-density differences across depth. Default OFF. */
  naturalVentilation: boolean;
  /** Gravitational acceleration used for NVP, m/s^2. */
  gravity: number;
  /** Convergence tolerance on the largest loop flow correction, m^3/s. */
  tolerance: number;
  /** Maximum solver iterations. */
  maxIterations: number;
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  referenceDensity: 1.2, // PLACEHOLDER reference (Ventsim convention) — verify against a primary source
  airDensity: 1.2,
  naturalVentilation: false,
  gravity: 9.81,
  tolerance: 1e-6,
  maxIterations: 1000,
};

/**
 * Whether a node/airway is present in stage `stageId`. Undefined or empty
 * membership means "all stages".
 */
export function inStage(item: { stages?: string[] }, stageId: string): boolean {
  return !item.stages || item.stages.length === 0 || item.stages.includes(stageId);
}

/**
 * The filtered view of the pooled network for one stage: airways belonging to
 * the stage, plus every node either assigned to the stage or touched by one of
 * those airways (so airway endpoints are never dangling).
 */
export function stageView(pool: VentNetwork, stageId: string): VentNetwork {
  const airways = pool.airways.filter((a) => inStage(a, stageId));
  const referenced = new Set<string>();
  for (const a of airways) {
    referenced.add(a.from);
    referenced.add(a.to);
  }
  const nodes = pool.nodes.filter((n) => inStage(n, stageId) || referenced.has(n.id));
  return { nodes, airways };
}
