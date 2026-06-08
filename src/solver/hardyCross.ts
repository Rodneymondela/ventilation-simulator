import type { VentNetwork, Fan } from '../model/types';
import {
  densityAdjustedResistance,
  airwayExponent,
  pressureDrop,
  DEFAULT_FLOW_EXPONENT,
} from './resistance';
import { fanPressure, fanSlope, fanState, type FanState } from './fan';

/**
 * Steady-state mine ventilation solver using the Hardy Cross MESH (loop) method.
 *
 * For each independent loop the algorithm applies a circulating flow correction
 *
 *     ΔQ = -  Σ_b dir_b · ( R_b·Q_b·|Q_b| - p_fan,b(Q_b) - p_src,b )
 *            ------------------------------------------------------
 *               Σ_b ( 2·R_b·|Q_b| - p'_fan,b(Q_b) )
 *
 * where the sum runs over the branches of the loop, `dir_b` is +1 if the loop
 * traverses the branch in its from->to orientation and -1 otherwise, and Q_b is
 * the signed branch flow (positive = from->to). Fans (and constant boundary
 * pressure sources) add pressure in the from->to direction, so they appear with
 * a minus sign in the head-loss balance.
 *
 * The numerator is Kirchhoff's pressure law around the loop (must reach 0); the
 * denominator is its derivative — i.e. a Newton step per loop, applied
 * Gauss-Seidel fashion. Initial flows are built by superposing a circulation on
 * each fundamental loop starting from the all-zero (continuity-satisfying)
 * state, so flow continuity at every node holds exactly at every iteration.
 *
 * BOUNDARY (fixed-pressure / atmosphere) NODES
 * Any node with `fixedPressure` set is tied to a single virtual reference node
 * by a zero-resistance virtual branch carrying a constant pressure source equal
 * to that node's pressure. This lets surface intake/exhaust flow circulate and
 * imposes the boundary pressures, while keeping the closed-loop solver intact.
 * Virtual branches are excluded from the reported airway results.
 */

export interface SolveOptions {
  maxIterations?: number;
  /** Convergence tolerance on the largest loop flow correction, m^3/s. */
  tolerance?: number;
  /** Initial circulating flow assumed in each fundamental loop, m^3/s. */
  initialFlow?: number;
  /** Reference air density resistances are standardised to, kg/m^3 (default 1.2). */
  referenceDensity?: number;
  /** Model-wide operating air density, kg/m^3 (defaults to referenceDensity → no adjustment). */
  airDensity?: number;
  /** Include natural ventilation pressure from air-density differences across depth. Default false. */
  naturalVentilation?: boolean;
  /** Gravitational acceleration for NVP, m/s^2 (default 9.81). */
  gravity?: number;
}

export interface AirwayResult {
  airwayId: string;
  /** Effective resistance, Pa·s^2/m^6 */
  R: number;
  /** Signed flow (positive = from->to), m^3/s */
  Q: number;
  /** Mean velocity = Q / A, m/s */
  velocity: number;
  /** Resistive pressure drop R·Q·|Q|, Pa (excludes any fan rise) */
  pressureDrop: number;
  /** Fan pressure rise at the solved flow, Pa (0 if no fan) */
  fanPressure: number;
  /** Operating state of this airway's fan, or undefined if there is no fan. */
  fanState?: FanState;
  /**
   * Contaminant concentration carried by this airway (upstream node value),
   * arbitrary units. Populated only when a contaminant solve has run.
   */
  concentration?: number;
}

export interface SolveResult {
  converged: boolean;
  iterations: number;
  /** Largest absolute loop correction at the final iteration, m^3/s. */
  residual: number;
  /** Number of independent loops (meshes) found. */
  loopCount: number;
  /** airwayId -> signed flow, m^3/s */
  flows: Record<string, number>;
  airwayResults: AirwayResult[];
  /**
   * nodeId -> net flow imbalance (inflow - outflow) over REAL airways, m^3/s.
   * ~0 at internal junctions when conserved. At fixed-pressure nodes this equals
   * the air exchanged with the surface/atmosphere (expected to be non-zero).
   */
  nodeImbalance: Record<string, number>;
}

interface Branch {
  from: number; // node index
  to: number; // node index
  R: number;
  /** Atkinson flow exponent n (p = R·|Q|^(n-1)·Q). */
  n: number;
  fan: Fan | null;
  /** Constant pressure source in the from->to direction, Pa (boundary branches). */
  pressureSource: number;
  /** Natural ventilation pressure in the from->to direction, Pa (0 when NVP off). */
  nvpSource: number;
  area: number;
  airwayId: string;
  /** Virtual boundary branch — excluded from reported results. */
  isVirtual: boolean;
}

interface LoopMember {
  branch: number;
  dir: 1 | -1;
}

const DENOM_FLOOR = 1e-9;

export function solveNetwork(network: VentNetwork, options: SolveOptions = {}): SolveResult {
  const maxIterations = options.maxIterations ?? 500;
  const tolerance = options.tolerance ?? 1e-6;
  const initialFlow = options.initialFlow ?? 1;
  const referenceDensity = options.referenceDensity ?? 1.2;
  // No model-wide operating density given → assume reference (factor 1, NVP columns at ρ_ref).
  const operatingDensity = options.airDensity ?? referenceDensity;
  const naturalVentilation = options.naturalVentilation ?? false;
  const gravity = options.gravity ?? 9.81;

  const nodeIndex = new Map<string, number>();
  network.nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  const branches: Branch[] = network.airways.map((a) => {
    const from = nodeIndex.get(a.from);
    const to = nodeIndex.get(a.to);
    if (from === undefined || to === undefined) {
      throw new Error(`Airway ${a.id} references an unknown node (${a.from} -> ${a.to})`);
    }
    // NVP: a column of air of density ρ gains static pressure going DEEPER (z is
    // depth, positive downward), so the from->to source is ρ·g·(z_to − z_from).
    // With uniform density this sums to zero around any closed loop (correct);
    // it only drives flow when intake/return densities differ.
    const localDensity = a.airDensity ?? operatingDensity;
    const nvpSource = naturalVentilation
      ? localDensity * gravity * (network.nodes[to].z - network.nodes[from].z)
      : 0;
    return {
      from,
      to,
      R: densityAdjustedResistance(a, referenceDensity, operatingDensity),
      n: airwayExponent(a),
      fan: a.fan ?? null,
      pressureSource: 0,
      nvpSource,
      area: a.area,
      airwayId: a.id,
      isVirtual: false,
    };
  });

  const realBranchCount = branches.length;

  // --- Boundary handling: tie every fixed-pressure node to one virtual node
  //     via a constant-pressure virtual branch (reference at pressure 0).
  const fixedNodes = network.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.fixedPressure != null);

  let nNodes = network.nodes.length;
  if (fixedNodes.length > 0) {
    const refIndex = nNodes; // appended virtual reference node
    nNodes += 1;
    for (const { n, i } of fixedNodes) {
      // virtual branch ref -> node, constant source = node pressure, so the
      // node is held at P_ref + p = p (reference is 0 Pa).
      branches.push({
        from: refIndex,
        to: i,
        R: 0,
        n: DEFAULT_FLOW_EXPONENT, // irrelevant: R = 0, pressure comes from the source
        fan: null,
        pressureSource: n.fixedPressure as number,
        nvpSource: 0,
        area: 0,
        airwayId: `__atm__${n.id}`,
        isVirtual: true,
      });
    }
  }

  const nBranches = branches.length;

  // --- Spanning forest via BFS; non-tree branches are chords (one loop each).
  const parentNode = new Array<number>(nNodes).fill(-1);
  const parentBranch = new Array<number>(nNodes).fill(-1);
  const depth = new Array<number>(nNodes).fill(0);
  const visited = new Array<boolean>(nNodes).fill(false);
  const isTreeBranch = new Array<boolean>(nBranches).fill(false);

  const adj: Array<Array<{ other: number; branch: number }>> = Array.from(
    { length: nNodes },
    () => [],
  );
  branches.forEach((b, i) => {
    adj[b.from].push({ other: b.to, branch: i });
    adj[b.to].push({ other: b.from, branch: i });
  });

  for (let start = 0; start < nNodes; start++) {
    if (visited[start]) continue;
    visited[start] = true;
    const queue = [start];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const { other, branch } of adj[u]) {
        if (!visited[other]) {
          visited[other] = true;
          parentNode[other] = u;
          parentBranch[other] = branch;
          depth[other] = depth[u] + 1;
          isTreeBranch[branch] = true;
          queue.push(other);
        }
      }
    }
  }

  // --- Build fundamental loops, one per chord.
  const loops: LoopMember[][] = [];
  for (let ci = 0; ci < nBranches; ci++) {
    if (isTreeBranch[ci]) continue;
    const chord = branches[ci];
    const member: LoopMember[] = [{ branch: ci, dir: 1 }];
    const pathNodes = treePathNodes(chord.to, chord.from, parentNode, depth);
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const x = pathNodes[i];
      const y = pathNodes[i + 1];
      const bIdx = parentNode[y] === x ? parentBranch[y] : parentBranch[x];
      const b = branches[bIdx];
      member.push({ branch: bIdx, dir: b.from === x && b.to === y ? 1 : -1 });
    }
    loops.push(member);
  }

  // --- Initial flows: superpose a circulation on each loop (preserves KCL).
  const Q = new Array<number>(nBranches).fill(0);
  for (const loop of loops) {
    for (const { branch, dir } of loop) {
      Q[branch] += dir * initialFlow;
    }
  }

  // --- Iterate.
  let iterations = 0;
  let residual = 0;
  let converged = loops.length === 0;
  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let maxCorrection = 0;
    for (const loop of loops) {
      let numerator = 0;
      let denominator = 0;
      for (const { branch, dir } of loop) {
        const b = branches[branch];
        const q = Q[branch];
        const headLoss =
          pressureDrop(b.R, q, b.n) -
          (b.fan ? fanPressure(b.fan, q) : 0) -
          b.pressureSource -
          b.nvpSource;
        numerator += dir * headLoss;
        const slope = b.fan ? fanSlope(b.fan, q) : 0;
        // d/dq [ R·|q|^(n-1)·q ] = n·R·|q|^(n-1)
        denominator += b.n * b.R * Math.abs(q) ** (b.n - 1) - slope;
      }
      if (Math.abs(denominator) < DENOM_FLOOR) {
        denominator = denominator < 0 ? -DENOM_FLOOR : DENOM_FLOOR;
      }
      const deltaQ = -numerator / denominator;
      for (const { branch, dir } of loop) {
        Q[branch] += dir * deltaQ;
      }
      maxCorrection = Math.max(maxCorrection, Math.abs(deltaQ));
    }
    residual = maxCorrection;
    if (maxCorrection < tolerance) {
      converged = true;
      break;
    }
  }

  // --- Assemble results (real airways only).
  const flows: Record<string, number> = {};
  const airwayResults: AirwayResult[] = [];
  for (let i = 0; i < realBranchCount; i++) {
    const b = branches[i];
    const q = Q[i];
    flows[b.airwayId] = q;
    airwayResults.push({
      airwayId: b.airwayId,
      R: b.R,
      Q: q,
      velocity: b.area > 0 ? q / b.area : 0,
      pressureDrop: pressureDrop(b.R, q, b.n),
      fanPressure: b.fan ? fanPressure(b.fan, q) : 0,
      fanState: b.fan ? fanState(b.fan, q) : undefined,
    });
  }

  const nodeImbalance: Record<string, number> = {};
  network.nodes.forEach((n) => (nodeImbalance[n.id] = 0));
  for (let i = 0; i < realBranchCount; i++) {
    const b = branches[i];
    const q = Q[i];
    nodeImbalance[network.nodes[b.from].id] -= q; // leaves `from`
    nodeImbalance[network.nodes[b.to].id] += q; // enters `to`
  }

  return {
    converged,
    iterations,
    residual,
    loopCount: loops.length,
    flows,
    airwayResults,
    nodeImbalance,
  };
}

/**
 * Ordered node indices of the unique tree path from `u` to `v`, inclusive.
 * Climbs both endpoints to their lowest common ancestor.
 */
function treePathNodes(u: number, v: number, parent: number[], depth: number[]): number[] {
  let a = u;
  let b = v;
  const up1: number[] = [];
  const up2: number[] = [];
  while (depth[a] > depth[b]) {
    up1.push(a);
    a = parent[a];
  }
  while (depth[b] > depth[a]) {
    up2.push(b);
    b = parent[b];
  }
  while (a !== b) {
    up1.push(a);
    a = parent[a];
    up2.push(b);
    b = parent[b];
  }
  up1.push(a); // lowest common ancestor
  return [...up1, ...up2.reverse()];
}
