import type { VentNetwork } from '../model/types';
import { airStateFromBulbs, airStateFromEnthalpy, STANDARD_PRESSURE, type AirState } from './psychrometrics';

/**
 * Steady-state thermodynamic (heat + moisture) march along the solved airflow.
 *
 * This runs AFTER the airflow solve, because air state is transported in the
 * solved flow directions and mixed at junctions (a single airflow-then-heat pass,
 * the spec's default; coupled airflow<->heat iteration is future work). It mirrors
 * the contaminant solver's flow-weighted junction mixing, but carries TWO
 * conserved quantities — moist-air enthalpy and moisture content — and applies
 * per-airway sources between an airway's upstream node and its downstream end.
 *
 * PHYSICS (forms only; psychrometric conversions are sourced via PsychroLib in
 * ./psychrometrics — see CLAUDE.md rule #1):
 *  - Autocompression: descending air converts gravitational potential energy to
 *    enthalpy. From the steady-flow energy equation, Δh = g·Δz per kg of air,
 *    with z = depth (positive down), so an airway from depth z_up to z_down adds
 *    g·(z_down − z_up) J/kg. This is McPherson's autocompression; the textbook
 *    "~10 °C per 1000 m" is only a magnitude sanity-check (see the test).
 *  - Sensible heat: a user W input raises enthalpy by W / mass-flow (J/kg).
 *  - Junction mixing: a node's enthalpy/moisture is the mass-flow-weighted mean
 *    of its incoming airways' outlet states (mass flow = |Q|·ρ).
 *
 * NOT modelled yet (need source-verified relations; flagged per CLAUDE.md):
 * latent/evaporative moisture pickup, diesel heat, rock-strata transient
 * conduction, condensation, and depth-varying barometric pressure. Moisture is
 * therefore conserved (carried and mixed, no source) in this pass.
 *
 * Intake boundary: fixed-pressure nodes that are net air sources (more air leaves
 * into the network than enters) are pinned to the supplied intake air state. A
 * closed recirculating network with a net heat source and no sink has no steady
 * state (like the contaminant solver) and is reported as not converged.
 */

export interface HeatOptions {
  /** Intake (boundary) dry-bulb temperature, °C. */
  intakeDryBulb: number;
  /** Intake (boundary) wet-bulb temperature, °C. */
  intakeWetBulb: number;
  /** Barometric pressure, Pa (constant in this pass). */
  pressure?: number;
  /** Gravitational acceleration for autocompression, m/s². */
  gravity?: number;
  /** Operating air density used to convert volume flow to mass flow, kg/m³. */
  airDensity?: number;
  maxIterations?: number;
  /** Convergence tolerance on the largest nodal enthalpy change, J/kg. */
  tolerance?: number;
}

export interface AirwayHeatResult {
  airwayId: string;
  /** Air state entering the airway (its upstream node). */
  inlet: AirState;
  /** Air state leaving the airway (after autocompression + sensible heat). */
  outlet: AirState;
  /** Sensible heat applied, W. */
  sensibleHeat: number;
}

export interface HeatResult {
  converged: boolean;
  iterations: number;
  /** nodeId -> air state */
  nodeStates: Record<string, AirState>;
  /** airwayId -> inlet/outlet air states */
  airwayStates: Record<string, AirwayHeatResult>;
}

const EPS = 1e-9;
const DIVERGE_LIMIT = 1e15;
const W_TOL = 1e-9; // moisture convergence tolerance, kg/kg

interface Edge {
  up: string;
  mag: number; // mass flow, kg/s
  dhAuto: number; // autocompression enthalpy change up->down, J/kg
  dhSensible: number; // sensible-heat enthalpy change, J/kg
  dw: number; // moisture change up->down, kg/kg (0 in this pass)
}

export function solveHeat(
  network: VentNetwork,
  flows: Record<string, number>,
  options: HeatOptions,
): HeatResult {
  const pressure = options.pressure ?? STANDARD_PRESSURE;
  const gravity = options.gravity ?? 9.81;
  const rho = options.airDensity ?? 1.2;
  const maxIterations = options.maxIterations ?? 1000;
  const tolerance = options.tolerance ?? 1e-3;

  const intake = airStateFromBulbs(options.intakeDryBulb, options.intakeWetBulb, pressure);

  const nodeById = new Map(network.nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Edge[]>();
  const outflow = new Map<string, number>();
  const inflow = new Map<string, number>();
  const H = new Map<string, number>(); // node enthalpy, J/kg
  const Wm = new Map<string, number>(); // node moisture, kg/kg
  const pinned = new Set<string>();

  for (const n of network.nodes) {
    incoming.set(n.id, []);
    outflow.set(n.id, 0);
    inflow.set(n.id, 0);
    H.set(n.id, intake.enthalpy);
    Wm.set(n.id, intake.humidityRatio);
  }

  for (const a of network.airways) {
    const q = flows[a.id] ?? 0;
    const mag = Math.abs(q) * rho;
    if (mag < EPS) continue;
    const up = q >= 0 ? a.from : a.to;
    const down = q >= 0 ? a.to : a.from;
    const zUp = nodeById.get(up)?.z ?? 0;
    const zDown = nodeById.get(down)?.z ?? 0;
    const dhAuto = gravity * (zDown - zUp); // z = depth, +down => descending warms
    const dhSensible = (a.sensibleHeat ?? 0) / mag;
    incoming.get(down)?.push({ up, mag, dhAuto, dhSensible, dw: 0 });
    outflow.set(up, (outflow.get(up) ?? 0) + mag);
    inflow.set(down, (inflow.get(down) ?? 0) + mag);
  }

  // Pin fixed-pressure nodes that are net air sources (intakes) to intake state.
  for (const n of network.nodes) {
    if (n.fixedPressure == null) continue;
    if ((outflow.get(n.id) ?? 0) > (inflow.get(n.id) ?? 0) + EPS) {
      pinned.add(n.id);
      H.set(n.id, intake.enthalpy);
      Wm.set(n.id, intake.humidityRatio);
    }
  }

  let iterations = 0;
  let converged = false;
  let diverged = false;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxDH = 0;
    let maxDW = 0;
    for (const n of network.nodes) {
      if (pinned.has(n.id)) continue;
      const edges = incoming.get(n.id) ?? [];
      const denom = edges.reduce((s, e) => s + e.mag, 0);
      if (denom < EPS) continue; // no inflow: leave at intake default
      let hIn = 0;
      let wIn = 0;
      for (const e of edges) {
        hIn += e.mag * ((H.get(e.up) ?? 0) + e.dhAuto + e.dhSensible);
        wIn += e.mag * ((Wm.get(e.up) ?? 0) + e.dw);
      }
      const nextH = hIn / denom;
      const nextW = wIn / denom;
      maxDH = Math.max(maxDH, Math.abs(nextH - (H.get(n.id) ?? 0)));
      maxDW = Math.max(maxDW, Math.abs(nextW - (Wm.get(n.id) ?? 0)));
      H.set(n.id, nextH);
      Wm.set(n.id, nextW);
      if (!Number.isFinite(nextH) || Math.abs(nextH) > DIVERGE_LIMIT) {
        diverged = true;
        break;
      }
    }
    if (diverged) break;
    if (maxDH < tolerance && maxDW < W_TOL) {
      converged = true;
      break;
    }
  }

  const nodeStates: Record<string, AirState> = {};
  for (const n of network.nodes) {
    nodeStates[n.id] = airStateFromEnthalpy(H.get(n.id) ?? intake.enthalpy, Wm.get(n.id) ?? 0, pressure);
  }

  const airwayStates: Record<string, AirwayHeatResult> = {};
  for (const a of network.airways) {
    const q = flows[a.id] ?? 0;
    const mag = Math.abs(q) * rho;
    const up = q >= 0 ? a.from : a.to;
    const down = q >= 0 ? a.to : a.from;
    const zUp = nodeById.get(up)?.z ?? 0;
    const zDown = nodeById.get(down)?.z ?? 0;
    const hUp = H.get(up) ?? intake.enthalpy;
    const wUp = Wm.get(up) ?? 0;
    const dhAuto = gravity * (zDown - zUp);
    const dhSensible = mag > EPS ? (a.sensibleHeat ?? 0) / mag : 0;
    airwayStates[a.id] = {
      airwayId: a.id,
      inlet: airStateFromEnthalpy(hUp, wUp, pressure),
      outlet: airStateFromEnthalpy(hUp + dhAuto + dhSensible, wUp, pressure),
      sensibleHeat: a.sensibleHeat ?? 0,
    };
  }

  return { converged: converged && !diverged, iterations, nodeStates, airwayStates };
}
