import { describe, it, expect } from 'vitest';
import { densityAdjustedResistance, solveNetwork } from './index';
import type { Airway, VentNetwork } from '../model/types';

function airway(patch: Partial<Airway>): Airway {
  return {
    id: 'A',
    from: 'N1',
    to: 'N2',
    length: 100,
    area: 10,
    perimeter: 12,
    frictionFactor: 0.012,
    resistanceOverride: 4, // fixed R so the density factor is the only variable
    ...patch,
  };
}

describe('density adjustment of resistance (R_local = R_ref · ρ/ρ_ref)', () => {
  it('no change when operating density equals the reference', () => {
    expect(densityAdjustedResistance(airway({}), 1.2, 1.2)).toBeCloseTo(4, 12);
  });

  it('scales linearly with the operating density', () => {
    // ρ doubled (2.4 / 1.2) → R doubled.
    expect(densityAdjustedResistance(airway({}), 1.2, 2.4)).toBeCloseTo(8, 12);
  });

  it("a per-airway airDensity overrides the model operating density", () => {
    // airway ρ = 0.6 against ρ_ref 1.2 → half R, ignoring the operating 2.4.
    expect(densityAdjustedResistance(airway({ airDensity: 0.6 }), 1.2, 2.4)).toBeCloseTo(2, 12);
  });

  it('the already-adjusted flag skips scaling entirely', () => {
    expect(densityAdjustedResistance(airway({ densityAdjusted: true }), 1.2, 2.4)).toBeCloseTo(4, 12);
  });
});

/**
 * Natural ventilation draft: a downcast + upcast shaft loop between surface (z=0)
 * and a level at z=500 m. Each airway has R=1 (already-adjusted so density does
 * not re-scale R). With a denser downcast column than the upcast, a circulation
 * develops with NO fan, driven purely by the density × depth pressure.
 *
 * Loop balance (both airways traversed forward, square law):
 *   2·R·Q² = g·Δz·(ρ_down − ρ_up)
 *   Q = sqrt( g·Δz·(ρ_down − ρ_up) / (2R) )
 * with g=9.81, Δz=500, ρ_down=1.3, ρ_up=1.1, R=1:
 *   Q = sqrt(9.81·500·0.2 / 2) = sqrt(490.5) ≈ 22.147 m³/s
 */
function shaftLoop(rhoDown: number, rhoUp: number): VentNetwork {
  return {
    nodes: [
      { id: 'S', x: 0, y: 0, z: 0 },
      { id: 'B', x: 0, y: 0, z: 500 },
    ],
    airways: [
      { id: 'D', from: 'S', to: 'B', length: 500, area: 10, perimeter: 12, frictionFactor: 0.01, resistanceOverride: 1, densityAdjusted: true, airDensity: rhoDown },
      { id: 'U', from: 'B', to: 'S', length: 500, area: 10, perimeter: 12, frictionFactor: 0.01, resistanceOverride: 1, densityAdjusted: true, airDensity: rhoUp },
    ],
  };
}

describe('natural ventilation pressure (NVP)', () => {
  it('drives a hand-checkable circulation when intake/return densities differ', () => {
    const expectedQ = Math.sqrt((9.81 * 500 * (1.3 - 1.1)) / 2);
    console.log('NVP draft — expected Q:', expectedQ);

    const r = solveNetwork(shaftLoop(1.3, 1.1), {
      naturalVentilation: true,
      tolerance: 1e-9,
    });
    expect(r.converged).toBe(true);
    // Dense air sinks down the downcast D (positive = from S to B).
    expect(r.flows.D).toBeCloseTo(expectedQ, 4);
    expect(r.flows.U).toBeCloseTo(expectedQ, 4);
    expect(expectedQ).toBeCloseTo(22.147, 3);
  });

  it('produces no draft under uniform density even across depth (NVP cancels round the loop)', () => {
    const r = solveNetwork(shaftLoop(1.2, 1.2), { naturalVentilation: true, tolerance: 1e-9 });
    expect(Math.abs(r.flows.D)).toBeLessThan(1e-6);
  });

  it('is inert when the NVP toggle is off', () => {
    const r = solveNetwork(shaftLoop(1.3, 1.1), { naturalVentilation: false, tolerance: 1e-9 });
    expect(Math.abs(r.flows.D)).toBeLessThan(1e-6);
  });
});
