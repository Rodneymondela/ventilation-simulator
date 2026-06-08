import { describe, it, expect } from 'vitest';
import { solveNetwork } from './hardyCross';
import { pressureDrop, airwayExponent } from './resistance';
import { fanState } from './fan';
import type { Airway, VentNetwork } from '../model/types';

describe('Atkinson flow exponent (laminar ↔ turbulent)', () => {
  it('pressureDrop p = R·|Q|^(n-1)·Q for several n', () => {
    // n = 2 recovers the turbulent square law
    expect(pressureDrop(2, 3, 2)).toBeCloseTo(18, 12);
    expect(pressureDrop(2, -3, 2)).toBeCloseTo(-18, 12);
    // n = 1 is the laminar linear law p = R·Q
    expect(pressureDrop(2, 3, 1)).toBeCloseTo(6, 12);
    expect(pressureDrop(2, -3, 1)).toBeCloseTo(-6, 12);
    // n = 1.5: R·sqrt(|Q|)·Q  ->  3·2·4 = 24
    expect(pressureDrop(3, 4, 1.5)).toBeCloseTo(24, 12);
    // default exponent is 2
    expect(pressureDrop(2, 3)).toBeCloseTo(18, 12);
  });

  it('airwayExponent defaults to 2 and clamps to [1, 2]', () => {
    const base: Airway = { id: 'x', from: 'a', to: 'b', length: 1, area: 1, perimeter: 1, frictionFactor: 0 };
    expect(airwayExponent(base)).toBe(2);
    expect(airwayExponent({ ...base, flowExponent: 1 })).toBe(1);
    expect(airwayExponent({ ...base, flowExponent: 0.5 })).toBe(1); // clamped up
    expect(airwayExponent({ ...base, flowExponent: 5 })).toBe(2); // clamped down
    expect(airwayExponent({ ...base, flowExponent: NaN })).toBe(2); // guarded
  });

  /**
   * HAND-CHECKABLE LAMINAR PARALLEL TEST.
   *
   * Two laminar (n = 1) branches in parallel between N1 and N2, one fan
   * returning the flow. With p = R·Q the parallel pair share an equal pressure
   * drop, so flow splits INVERSELY WITH RESISTANCE (not its square root):
   *
   *   A1: N1->N2,  R1 = 1,  n = 1
   *   A2: N1->N2,  R2 = 2,  n = 1
   *   F : N2->N1,  R = 0,   fan line p = 7 - Q
   *
   *   Equal drop:   R1·Q1 = R2·Q2  =>  Q1 = 2·Q2
   *   Parallel R:   1/Rp = 1/R1 + 1/R2 = 1.5  =>  Rp = 2/3
   *   Operating pt: Rp·Q = 7 - Q  =>  (2/3 + 1)·Q = 7  =>  Q = 4.2,  p = 2.8
   *   Split:        Q1 + Q2 = 4.2, Q1 = 2·Q2  =>  Q1 = 2.8,  Q2 = 1.4
   *   Check:        R1·Q1 = 2.8 = R2·Q2 = 2.8 = operating pressure ✓
   */
  const EXPECTED = { Q1: 2.8, Q2: 1.4, Qfan: 4.2, operatingPressure: 2.8, splitRatio: 2.0 };

  const network: VentNetwork = {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0 },
      { id: 'N2', x: 100, y: 0, z: 0 },
    ],
    airways: [
      { id: 'A1', from: 'N1', to: 'N2', length: 1, area: 1, perimeter: 1, frictionFactor: 0, resistanceOverride: 1, flowExponent: 1 },
      { id: 'A2', from: 'N1', to: 'N2', length: 1, area: 1, perimeter: 1, frictionFactor: 0, resistanceOverride: 2, flowExponent: 1 },
      {
        id: 'F',
        from: 'N2',
        to: 'N1',
        length: 1,
        area: 1,
        perimeter: 1,
        frictionFactor: 0,
        resistanceOverride: 0,
        fan: { id: 'fan1', name: 'Main fan', curve: [{ q: 0, p: 7 }, { q: 7, p: 0 }] },
      },
    ],
  };

  it('laminar flow splits inversely with resistance and conserves flow', () => {
    const result = solveNetwork(network, { tolerance: 1e-9, maxIterations: 500 });
    // eslint-disable-next-line no-console
    console.log('Laminar parallel — expected:', EXPECTED, 'flows:', result.flows);

    expect(result.converged).toBe(true);
    const q1 = result.flows.A1;
    const q2 = result.flows.A2;
    expect(q1).toBeCloseTo(EXPECTED.Q1, 6);
    expect(q2).toBeCloseTo(EXPECTED.Q2, 6);
    expect(result.flows.F).toBeCloseTo(EXPECTED.Qfan, 6);

    // Inverse-resistance split (would be sqrt(2) ≈ 1.414 if turbulent).
    expect(q1 / q2).toBeCloseTo(EXPECTED.splitRatio, 6);

    // Equal LINEAR pressure drop across the pair = operating pressure.
    expect(1 * q1).toBeCloseTo(2 * q2, 6);
    expect(1 * q1).toBeCloseTo(EXPECTED.operatingPressure, 6);

    // The reported pressureDrop honours n = 1 (linear), not the square law.
    const a1 = result.airwayResults.find((r) => r.airwayId === 'A1')!;
    expect(a1.pressureDrop).toBeCloseTo(EXPECTED.operatingPressure, 6);

    expect(Math.abs(result.nodeImbalance.N1)).toBeLessThan(1e-6);
    expect(Math.abs(result.nodeImbalance.N2)).toBeLessThan(1e-6);
  });
});

describe('fan state classification', () => {
  const falling = { id: 'f', curve: [{ q: 0, p: 3000 }, { q: 100, p: 1800 }, { q: 200, p: 0 }] };
  // A curve that rises then falls, so it has a stall (positive-slope) region.
  const humped = { id: 'h', curve: [{ q: 0, p: 1000 }, { q: 50, p: 1400 }, { q: 100, p: 1200 }, { q: 150, p: 500 }] };

  it('normal: forward flow on the falling part', () => {
    expect(fanState(falling, 120)).toBe('normal');
  });
  it('reverse: backward flow through the fan', () => {
    expect(fanState(falling, -10)).toBe('reverse');
  });
  it('off: switched off regardless of flow', () => {
    expect(fanState({ ...falling, off: true }, 120)).toBe('off');
    expect(fanState({ ...falling, off: true }, -10)).toBe('off');
  });
  it('stalled: forward flow on the rising part of a humped curve', () => {
    expect(fanState(humped, 25)).toBe('stalled'); // slope +8 between 0 and 50
    expect(fanState(humped, 120)).toBe('normal'); // past the peak, falling
  });
});
