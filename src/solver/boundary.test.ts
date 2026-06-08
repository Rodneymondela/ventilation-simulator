import { describe, it, expect } from 'vitest';
import { solveNetwork } from './hardyCross';
import type { VentNetwork } from '../model/types';

/**
 * Fixed-pressure (atmosphere) boundary test, hand-checkable.
 *
 *   S1 (fixedPressure = 100 Pa)  --A(R=4)-->  S2 (fixedPressure = 0 Pa)
 *
 * The 100 Pa surface pressure difference drives flow through one airway of
 * resistance R = 4 Pa·s²/m⁶:
 *
 *   Δp = R·Q²  =>  100 = 4·Q²  =>  Q = sqrt(25) = 5 m³/s  (from S1 to S2)
 */
describe('Hardy Cross solver — fixed-pressure boundary', () => {
  const network: VentNetwork = {
    nodes: [
      { id: 'S1', x: 0, y: 0, z: 0, fixedPressure: 100 },
      { id: 'S2', x: 100, y: 0, z: 0, fixedPressure: 0 },
    ],
    airways: [
      {
        id: 'A',
        from: 'S1',
        to: 'S2',
        length: 1,
        area: 2,
        perimeter: 4,
        frictionFactor: 0,
        resistanceOverride: 4,
      },
    ],
  };

  it('drives Q = 5 m³/s from high to low pressure', () => {
    const result = solveNetwork(network, { tolerance: 1e-9 });
    expect(result.converged).toBe(true);
    expect(result.flows.A).toBeCloseTo(5, 5);

    // Surface exchange shows up as node imbalance at the fixed-pressure nodes.
    expect(result.nodeImbalance.S1).toBeCloseTo(-5, 5); // 5 leaves to airway
    expect(result.nodeImbalance.S2).toBeCloseTo(5, 5); // 5 arrives from airway

    // Velocity = Q / A = 5 / 2 = 2.5 m/s
    const a = result.airwayResults.find((r) => r.airwayId === 'A')!;
    expect(a.velocity).toBeCloseTo(2.5, 5);
  });
});
