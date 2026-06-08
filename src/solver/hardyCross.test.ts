import { describe, it, expect } from 'vitest';
import { solveNetwork } from './hardyCross';
import { atkinsonResistance } from './resistance';
import type { VentNetwork } from '../model/types';

/**
 * MANDATORY SOLVER SANITY TEST (hand-checkable).
 *
 * Two airways in parallel between the same two nodes, with one fan driving the
 * circuit. Everything below is derived by hand and printed so the check is
 * transparent.
 *
 *   Nodes: N1, N2
 *   A1: N1 -> N2,  k=0.25, O=4, L=1, A=1  =>  R1 = kOL/A^3 = 0.25*4*1/1 = 1.0
 *   A2: N1 -> N2,  k=1.00, O=4, L=1, A=1  =>  R2 = kOL/A^3 = 1.00*4*1/1 = 4.0
 *   F : N2 -> N1,  R=0 (return branch), fan curve is the line p = 7 - Q
 *       (sampled at (0,7) and (7,0)); the fan drives the circuit.
 *
 * HAND DERIVATION
 *   Parallel resistance Rp:   1/sqrt(Rp) = 1/sqrt(R1) + 1/sqrt(R2) = 1 + 0.5 = 1.5
 *                             => sqrt(Rp) = 1/1.5 = 0.6667  => Rp = 0.4444
 *   Operating point (system meets fan):  Rp*Q^2 = 7 - Q
 *                             0.4444*Q^2 + Q - 7 = 0  =>  Q = 3 m^3/s,  p = 4 Pa
 *   Flow split (equal pressure drop across the parallel pair):
 *                             R1*Q1^2 = R2*Q2^2  =>  Q1/Q2 = sqrt(R2/R1) = 2
 *                             with Q1 + Q2 = 3   =>  Q1 = 2,  Q2 = 1
 */
describe('Hardy Cross solver — parallel airways with one fan', () => {
  // Build the network. resistanceOverride is NOT used: R1 and R2 come straight
  // from the Atkinson geometry, exercising the real resistance maths.
  const network: VentNetwork = {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0 },
      { id: 'N2', x: 100, y: 0, z: 0 },
    ],
    airways: [
      {
        id: 'A1',
        from: 'N1',
        to: 'N2',
        length: 1,
        area: 1,
        perimeter: 4,
        frictionFactor: 0.25, // -> R1 = 1.0
      },
      {
        id: 'A2',
        from: 'N1',
        to: 'N2',
        length: 1,
        area: 1,
        perimeter: 4,
        frictionFactor: 1.0, // -> R2 = 4.0
      },
      {
        id: 'F',
        from: 'N2',
        to: 'N1',
        length: 1,
        area: 1,
        perimeter: 4,
        frictionFactor: 0,
        resistanceOverride: 0, // pure fan branch, no resistance
        fan: {
          id: 'fan1',
          name: 'Main fan',
          curve: [
            { q: 0, p: 7 },
            { q: 7, p: 0 }, // line p = 7 - Q
          ],
        },
      },
    ],
  };

  const EXPECTED = {
    R1: 1.0,
    R2: 4.0,
    Q1: 2.0,
    Q2: 1.0,
    Qfan: 3.0,
    operatingPressure: 4.0,
    splitRatio: 2.0, // Q1/Q2 = sqrt(R2/R1)
  };

  it('resistance maths match the hand calculation', () => {
    expect(atkinsonResistance(0.25, 4, 1, 1)).toBeCloseTo(EXPECTED.R1, 9);
    expect(atkinsonResistance(1.0, 4, 1, 1)).toBeCloseTo(EXPECTED.R2, 9);
  });

  it('converges and matches hand-derived flows, split and conservation', () => {
    const result = solveNetwork(network, { tolerance: 1e-9, maxIterations: 500 });

    // Transparency: print expected vs actual so the check is auditable.
    // eslint-disable-next-line no-console
    console.log('Hand-derived expected:', EXPECTED);
    // eslint-disable-next-line no-console
    console.log('Solver result:', {
      converged: result.converged,
      iterations: result.iterations,
      residual: result.residual,
      loopCount: result.loopCount,
      flows: result.flows,
      nodeImbalance: result.nodeImbalance,
    });

    expect(result.converged).toBe(true);
    expect(result.loopCount).toBe(2);

    const q1 = result.flows.A1;
    const q2 = result.flows.A2;
    const qf = result.flows.F;

    // Flows match the hand calc (signs: airways carry flow N1->N2, fan returns
    // it N2->N1, so all three are positive in their from->to orientation).
    expect(q1).toBeCloseTo(EXPECTED.Q1, 5);
    expect(q2).toBeCloseTo(EXPECTED.Q2, 5);
    expect(qf).toBeCloseTo(EXPECTED.Qfan, 5);

    // Flow splits inversely with sqrt of resistance ratio.
    expect(q1 / q2).toBeCloseTo(EXPECTED.splitRatio, 5);
    expect(q1 / q2).toBeCloseTo(Math.sqrt(EXPECTED.R2 / EXPECTED.R1), 5);

    // Equal pressure drop across the parallel pair = operating pressure.
    const dp1 = EXPECTED.R1 * q1 * q1;
    const dp2 = EXPECTED.R2 * q2 * q2;
    expect(dp1).toBeCloseTo(dp2, 5);
    expect(dp1).toBeCloseTo(EXPECTED.operatingPressure, 5);

    // Fan operating point.
    const fanRes = result.airwayResults.find((r) => r.airwayId === 'F')!;
    expect(fanRes.fanPressure).toBeCloseTo(EXPECTED.operatingPressure, 5);

    // Flow conserved at every node within tolerance.
    expect(Math.abs(result.nodeImbalance.N1)).toBeLessThan(1e-6);
    expect(Math.abs(result.nodeImbalance.N2)).toBeLessThan(1e-6);
  });
});
