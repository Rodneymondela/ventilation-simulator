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
  /** True if this airway is blocked (sealed): excluded from the solve, Q = 0. */
  blocked?: boolean;
  /** True if this airway's flow was held to a fixed value by a flow controller. */
  fixedFlow?: boolean;
  /**
   * For a fixed-flow airway, the pressure the controller must supply in the
   * from->to direction to hold the set flow (Pa). Positive = booster (adds
   * pressure), negative = regulator/throttle (absorbs pressure).
   */
  fixedFlowPressure?: number;
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
  /** Sealed airway: excluded from the graph, carries no flow. */
  blocked: boolean;
  /** Held flow in the from->to direction, m^3/s, or null if free. */
  fixedFlow: number | null;
}

interface LoopMember {
  branch: number;
  dir: 1 | -1;
}

interface Loop {
  members: LoopMember[];
  /** Chord branch index this fundamental loop is built around. */
  chord: number;
  /** A frozen loop holds a fixed-flow chord and is never corrected. */
  frozen: boolean;
  /** Circulating flow seeded into the loop (the held flow for a frozen loop). */
  current: number;
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
    const blocked = a.blocked ?? false;
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
      blocked,
      // A blocked airway carries no flow at all, so blocking wins over a fixed flow.
      fixedFlow: !blocked && a.fixedFlow != null ? a.fixedFlow : null,
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
        blocked: false,
        fixedFlow: null,
      });
    }
  }

  const nBranches = branches.length;

  // --- Spanning forest via BFS over FREE branches only (blocked branches carry
  //     no flow; fixed-flow branches are forced to be chords so each gets its own
  //     fundamental loop that we can freeze at the held flow). A chord appears in
  //     exactly one fundamental loop, so freezing that loop pins the chord's flow
  //     while the rest of the network still balances pressure normally.
  const treeEligible = (i: number) => !branches[i].blocked && branches[i].fixedFlow === null;

  const parentNode = new Array<number>(nNodes).fill(-1);
  const parentBranch = new Array<number>(nNodes).fill(-1);
  const depth = new Array<number>(nNodes).fill(0);
  const component = new Array<number>(nNodes).fill(-1);
  const visited = new Array<boolean>(nNodes).fill(false);
  const isTreeBranch = new Array<boolean>(nBranches).fill(false);

  const adj: Array<Array<{ other: number; branch: number }>> = Array.from(
    { length: nNodes },
    () => [],
  );
  branches.forEach((b, i) => {
    if (!treeEligible(i)) return; // blocked / fixed-flow branches do not span the tree
    adj[b.from].push({ other: b.to, branch: i });
    adj[b.to].push({ other: b.from, branch: i });
  });

  let nextComponent = 0;
  for (let start = 0; start < nNodes; start++) {
    if (visited[start]) continue;
    const comp = nextComponent++;
    visited[start] = true;
    component[start] = comp;
    const queue = [start];
    while (queue.length > 0) {
      const u = queue.shift()!;
      for (const { other, branch } of adj[u]) {
        if (!visited[other]) {
          visited[other] = true;
          component[other] = comp;
          parentNode[other] = u;
          parentBranch[other] = branch;
          depth[other] = depth[u] + 1;
          isTreeBranch[branch] = true;
          queue.push(other);
        }
      }
    }
  }

  // --- Build fundamental loops, one per chord (free chords + every fixed-flow branch).
  const loops: Loop[] = [];
  for (let ci = 0; ci < nBranches; ci++) {
    if (branches[ci].blocked || isTreeBranch[ci]) continue;
    const chord = branches[ci];
    if (component[chord.from] !== component[chord.to]) {
      // The only path between its endpoints is itself (a bridge). A fixed-flow
      // bridge cannot be balanced as an independent loop; report it honestly.
      if (chord.fixedFlow !== null) {
        throw new Error(
          `Airway ${chord.airwayId}: cannot fix the flow on a branch that is the only ` +
            `connection between its nodes (no surrounding circuit to balance it).`,
        );
      }
      continue; // (shouldn't happen for a free branch — BFS would have used it)
    }
    const member: LoopMember[] = [{ branch: ci, dir: 1 }];
    const pathNodes = treePathNodes(chord.to, chord.from, parentNode, depth);
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const x = pathNodes[i];
      const y = pathNodes[i + 1];
      const bIdx = parentNode[y] === x ? parentBranch[y] : parentBranch[x];
      const b = branches[bIdx];
      member.push({ branch: bIdx, dir: b.from === x && b.to === y ? 1 : -1 });
    }
    const frozen = chord.fixedFlow !== null;
    loops.push({ members: member, chord: ci, frozen, current: frozen ? chord.fixedFlow! : initialFlow });
  }

  const freeLoops = loops.filter((l) => !l.frozen);

  // --- Initial flows: superpose each loop's circulation (preserves KCL). A frozen
  //     loop seeds its held flow; since its chord rides only this loop (dir +1),
  //     the chord flow stays exactly that value because the loop is never corrected.
  const Q = new Array<number>(nBranches).fill(0);
  for (const loop of loops) {
    for (const { branch, dir } of loop.members) {
      Q[branch] += dir * loop.current;
    }
  }

  // --- Iterate the free loops only.
  let iterations = 0;
  let residual = 0;
  let converged = freeLoops.length === 0;
  for (let iter = 0; iter < maxIterations && freeLoops.length > 0; iter++) {
    iterations = iter + 1;
    let maxCorrection = 0;
    for (const loop of freeLoops) {
      let numerator = 0;
      let denominator = 0;
      for (const { branch, dir } of loop.members) {
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
      for (const { branch, dir } of loop.members) {
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

  // --- Controller pressure for each fixed-flow branch: the pressure its flow
  //     controller must add (from->to) so KVL closes around its frozen loop.
  const fixedFlowPressure: Record<string, number> = {};
  for (const loop of loops) {
    if (!loop.frozen) continue;
    let sum = 0;
    for (const { branch, dir } of loop.members) {
      const b = branches[branch];
      const q = Q[branch];
      sum +=
        dir *
        (pressureDrop(b.R, q, b.n) -
          (b.fan ? fanPressure(b.fan, q) : 0) -
          b.pressureSource -
          b.nvpSource);
    }
    fixedFlowPressure[branches[loop.chord].airwayId] = sum;
  }

  // --- Assemble results (real airways only).
  const flows: Record<string, number> = {};
  const airwayResults: AirwayResult[] = [];
  for (let i = 0; i < realBranchCount; i++) {
    const b = branches[i];
    const q = Q[i]; // 0 for blocked branches (they ride no loop), held value for fixed-flow
    flows[b.airwayId] = q;
    airwayResults.push({
      airwayId: b.airwayId,
      R: b.R,
      Q: q,
      velocity: b.area > 0 ? q / b.area : 0,
      pressureDrop: pressureDrop(b.R, q, b.n),
      fanPressure: b.fan ? fanPressure(b.fan, q) : 0,
      fanState: b.fan ? fanState(b.fan, q) : undefined,
      blocked: b.blocked || undefined,
      fixedFlow: b.fixedFlow !== null || undefined,
      fixedFlowPressure: b.fixedFlow !== null ? fixedFlowPressure[b.airwayId] : undefined,
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
