import { describe, it, expect } from 'vitest';
import { solveNetwork } from './index';
import type { Airway, Fan, VentNetwork } from '../model/types';

/** A flat fan curve: constant pressure rise `p` Pa at any flow. */
function flatFan(p: number): Fan {
  return { id: 'F', curve: [{ q: 0, p }, { q: 50, p }] };
}

function aw(patch: Partial<Airway> & Pick<Airway, 'id' | 'from' | 'to'>): Airway {
  return {
    length: 100,
    area: 10,
    perimeter: 12,
    frictionFactor: 0.01,
    resistanceOverride: 1, // fixed R=1 so the algebra stays hand-checkable
    ...patch,
  };
}

describe('blocked airways', () => {
  // Parallel A1 / A2 between N1,N2 with a flat-8 Pa fan on the return AF (N2->N1).
  // Blocking A2 forces all air through A1; loop A1+AF gives 2·R·Q² = 8 → Q = 2.
  const net = (block: boolean): VentNetwork => ({
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0 },
      { id: 'N2', x: 1, y: 0, z: 0 },
    ],
    airways: [
      aw({ id: 'A1', from: 'N1', to: 'N2' }),
      aw({ id: 'A2', from: 'N1', to: 'N2', blocked: block }),
      aw({ id: 'AF', from: 'N2', to: 'N1', fan: flatFan(8) }),
    ],
  });

  it('a blocked airway carries no flow and the rest re-routes', () => {
    const r = solveNetwork(net(true), { tolerance: 1e-9 });
    expect(r.converged).toBe(true);
    expect(r.flows.A2).toBe(0);
    expect(r.airwayResults.find((x) => x.airwayId === 'A2')!.blocked).toBe(true);
    // All flow through A1: 2Q² = 8 → Q = 2.
    expect(r.flows.A1).toBeCloseTo(2, 6);
    expect(r.flows.AF).toBeCloseTo(2, 6);
    // Continuity holds at the internal junctions.
    expect(Math.abs(r.nodeImbalance.N1)).toBeLessThan(1e-6);
    expect(Math.abs(r.nodeImbalance.N2)).toBeLessThan(1e-6);
  });

  it('unblocking restores the parallel split (sanity that the block was the cause)', () => {
    const r = solveNetwork(net(false), { tolerance: 1e-9 });
    // Two equal-R parallel paths now share the flow.
    expect(r.flows.A2).toBeGreaterThan(0.1);
  });
});

describe('fixed-flow airways', () => {
  // A1 (N1->N2) and A2 (N2->N1, flat-8 fan) form one loop. Fix A1 at 3 m³/s.
  // Both branches then carry 3 (single loop ⇒ same circulating flow). The A1
  // controller must add p so KVL closes round the loop:
  //   p = R·3² (A1)  +  [R·3² − 8] (A2)  = 9 + 1 = 10 Pa  (a booster).
  const fixedNet: VentNetwork = {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0 },
      { id: 'N2', x: 1, y: 0, z: 0 },
    ],
    airways: [
      aw({ id: 'A1', from: 'N1', to: 'N2', fixedFlow: 3 }),
      aw({ id: 'A2', from: 'N2', to: 'N1', fan: flatFan(8) }),
    ],
  };

  it('holds the set flow and reports the required controller pressure', () => {
    console.log('Fixed flow — expected Q=3 on both, controller p=10 Pa');
    const r = solveNetwork(fixedNet, { tolerance: 1e-9 });
    expect(r.converged).toBe(true);
    expect(r.flows.A1).toBeCloseTo(3, 9);
    expect(r.flows.A2).toBeCloseTo(3, 9);
    const a1 = r.airwayResults.find((x) => x.airwayId === 'A1')!;
    expect(a1.fixedFlow).toBe(true);
    expect(a1.fixedFlowPressure).toBeCloseTo(10, 6);
    expect(Math.abs(r.nodeImbalance.N1)).toBeLessThan(1e-9);
  });

  it('blocking overrides a fixed flow (Q = 0, not the set value)', () => {
    const net: VentNetwork = {
      ...fixedNet,
      airways: [
        aw({ id: 'A1', from: 'N1', to: 'N2', fixedFlow: 3, blocked: true }),
        aw({ id: 'A2', from: 'N2', to: 'N1', fan: flatFan(8) }),
      ],
    };
    const r = solveNetwork(net, { tolerance: 1e-9 });
    expect(r.flows.A1).toBe(0);
  });

  it('refuses to fix the flow on a bridge (no surrounding circuit)', () => {
    // N1 -A1- N2 -A2- N3 in series: A2 is the only path to N3.
    const net: VentNetwork = {
      nodes: [
        { id: 'N1', x: 0, y: 0, z: 0 },
        { id: 'N2', x: 1, y: 0, z: 0 },
        { id: 'N3', x: 2, y: 0, z: 0 },
      ],
      airways: [
        aw({ id: 'A1', from: 'N1', to: 'N2' }),
        aw({ id: 'A2', from: 'N2', to: 'N3', fixedFlow: 5 }),
      ],
    };
    expect(() => solveNetwork(net, {})).toThrow(/only connection/i);
  });
});
