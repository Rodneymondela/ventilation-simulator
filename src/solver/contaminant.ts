import type { VentNetwork } from '../model/types';

/**
 * Steady-state contaminant transport by flow-weighted mixing at junctions.
 *
 * APPROXIMATE / EDUCATIONAL ONLY — not a validated occupational-exposure tool.
 *
 * Assumptions (all explicit):
 *  - Conservative tracer: no decay, deposition, or chemical reaction.
 *  - Perfect mixing at every junction: a node has a single concentration C_n.
 *  - Each airway carries its UPSTREAM node's concentration (plug flow, the
 *    upstream node decided by the solved flow direction).
 *  - Steady state: node mass balance  C_n · O_n = Σ_in |Q|·C_up + injection_n,
 *    where O_n is the total flow leaving node n through airways. Nodes flagged
 *    with a fixed concentration are clamped (fresh-air intake = 0, or a held
 *    source). A bounded steady state requires either a fixed-concentration node
 *    or through-flow to atmosphere to remove contaminant; a purely closed loop
 *    with a net injection has no steady state and is reported as not converged.
 *
 * Solved by Gauss-Seidel iteration (small networks converge quickly).
 */

export interface ContaminantOptions {
  maxIterations?: number;
  tolerance?: number;
}

export interface ContaminantResult {
  converged: boolean;
  iterations: number;
  /** nodeId -> concentration (arbitrary units) */
  nodeConcentration: Record<string, number>;
  /** airwayId -> concentration carried (upstream node value) */
  airwayConcentration: Record<string, number>;
}

const EPS = 1e-9;
const DIVERGE_LIMIT = 1e12;

export function solveContaminant(
  network: VentNetwork,
  flows: Record<string, number>,
  options: ContaminantOptions = {},
): ContaminantResult {
  const maxIterations = options.maxIterations ?? 1000;
  const tolerance = options.tolerance ?? 1e-7;

  const incoming = new Map<string, Array<{ up: string; mag: number }>>();
  const outflow = new Map<string, number>();
  const inflow = new Map<string, number>();
  const C = new Map<string, number>();
  const fixed = new Set<string>();

  for (const n of network.nodes) {
    incoming.set(n.id, []);
    outflow.set(n.id, 0);
    inflow.set(n.id, 0);
    if (n.contaminantConcentration != null) {
      C.set(n.id, n.contaminantConcentration);
      fixed.add(n.id);
    } else {
      C.set(n.id, 0);
    }
  }

  for (const a of network.airways) {
    const q = flows[a.id] ?? 0;
    const mag = Math.abs(q);
    if (mag < EPS) continue;
    const up = q >= 0 ? a.from : a.to;
    const down = q >= 0 ? a.to : a.from;
    incoming.get(down)?.push({ up, mag });
    outflow.set(up, (outflow.get(up) ?? 0) + mag);
    inflow.set(down, (inflow.get(down) ?? 0) + mag);
  }

  let iterations = 0;
  let converged = false;
  let diverged = false;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxDelta = 0;
    for (const n of network.nodes) {
      if (fixed.has(n.id)) continue;
      const denom = (outflow.get(n.id) ?? 0) > EPS ? outflow.get(n.id)! : inflow.get(n.id)!;
      if (denom < EPS) continue; // isolated / no flow through this node
      let massIn = n.contaminantInjection ?? 0;
      for (const { up, mag } of incoming.get(n.id) ?? []) {
        massIn += mag * (C.get(up) ?? 0);
      }
      const next = massIn / denom;
      maxDelta = Math.max(maxDelta, Math.abs(next - (C.get(n.id) ?? 0)));
      C.set(n.id, next);
      if (!Number.isFinite(next) || Math.abs(next) > DIVERGE_LIMIT) {
        diverged = true;
        break;
      }
    }
    if (diverged) break;
    if (maxDelta < tolerance) {
      converged = true;
      break;
    }
  }

  const nodeConcentration: Record<string, number> = {};
  network.nodes.forEach((n) => (nodeConcentration[n.id] = C.get(n.id) ?? 0));

  const airwayConcentration: Record<string, number> = {};
  for (const a of network.airways) {
    const q = flows[a.id] ?? 0;
    const up = q >= 0 ? a.from : a.to;
    airwayConcentration[a.id] = C.get(up) ?? 0;
  }

  return {
    converged: converged && !diverged,
    iterations,
    nodeConcentration,
    airwayConcentration,
  };
}
