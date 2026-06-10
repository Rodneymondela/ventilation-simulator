import { describe, it, expect } from 'vitest';
import type { VentNetwork } from '../model/types';
import { solveHeat } from './heat';
import { airStateFromBulbs, STANDARD_PRESSURE } from './psychrometrics';

const G = 9.81;
const RHO = 1.2;
const INTAKE = { intakeDryBulb: 10, intakeWetBulb: 8, gravity: G, airDensity: RHO };
const h0 = airStateFromBulbs(10, 8, STANDARD_PRESSURE).enthalpy;

/**
 * Hand-checkable thermodynamic-march tests. Each asserts on ENTHALPY — the
 * conserved quantity the march transports (J/kg dry air) — because it equals the
 * applied energy per unit mass exactly and so can be checked without re-deriving
 * any psychrometric maths. Expected vs computed is printed.
 */
describe('thermodynamic march (heat + moisture)', () => {
  it('autocompression adds g·Δz of enthalpy down a declining airway', () => {
    // I (surface intake) -> X, descending 500 m, no sensible heat.
    const net: VentNetwork = {
      nodes: [
        { id: 'I', x: 0, y: 0, z: 0, fixedPressure: 0 },
        { id: 'X', x: 1, y: 0, z: 500 },
      ],
      airways: [
        { id: 'A1', from: 'I', to: 'X', length: 500, area: 10, perimeter: 12, frictionFactor: 0.01 },
      ],
    };
    const r = solveHeat(net, { A1: 10 }, INTAKE);
    const a = r.airwayStates.A1;
    const dh = a.outlet.enthalpy - a.inlet.enthalpy;
    const dT = r.nodeStates.X.dryBulb - 10;
    console.log(`autocompression Δz=500m: Δh expected ${(G * 500).toFixed(1)} J/kg, computed ${dh.toFixed(1)}`);
    console.log(`  dry-bulb rise: ~${(10 * 0.5).toFixed(1)}°C sanity (10°C/1000m), computed ${dT.toFixed(2)}°C`);
    expect(r.converged).toBe(true);
    expect(dh).toBeCloseTo(G * 500, 2); // 4905 J/kg, exact
    expect(dT).toBeGreaterThan(4);
    expect(dT).toBeLessThan(5.5);
    // Moisture is conserved (no latent source in this pass).
    expect(r.nodeStates.X.humidityRatio).toBeCloseTo(airStateFromBulbs(10, 8).humidityRatio, 9);
  });

  it('sensible heat raises enthalpy by W / mass-flow', () => {
    // Flat airway, 60 kW into 10 m³/s · 1.2 kg/m³ = 12 kg/s -> 5000 J/kg.
    const net: VentNetwork = {
      nodes: [
        { id: 'I', x: 0, y: 0, z: 0, fixedPressure: 0 },
        { id: 'X', x: 1, y: 0, z: 0 },
      ],
      airways: [
        { id: 'A1', from: 'I', to: 'X', length: 100, area: 10, perimeter: 12, frictionFactor: 0.01, sensibleHeat: 60000 },
      ],
    };
    const r = solveHeat(net, { A1: 10 }, INTAKE);
    const a = r.airwayStates.A1;
    const dh = a.outlet.enthalpy - a.inlet.enthalpy;
    console.log(`sensible 60kW / 12 kg/s: Δh expected 5000.0 J/kg, computed ${dh.toFixed(1)}`);
    expect(r.converged).toBe(true);
    expect(dh).toBeCloseTo(5000, 2);
  });

  it('junctions mix enthalpy by mass flow', () => {
    // Two intakes feed M (depth 400). I at surface descends 400 m (+g·400 J/kg);
    // K already at 400 m adds none. Mass flows 7.2 and 4.8 kg/s.
    // Expected M enthalpy = h0 + (7.2·g·400)/12 = h0 + 2354.4 J/kg.
    const net: VentNetwork = {
      nodes: [
        { id: 'I', x: 0, y: 0, z: 0, fixedPressure: 0 },
        { id: 'K', x: 0, y: 2, z: 400, fixedPressure: 0 },
        { id: 'M', x: 2, y: 1, z: 400 },
      ],
      airways: [
        { id: 'A1', from: 'I', to: 'M', length: 400, area: 10, perimeter: 12, frictionFactor: 0.01 },
        { id: 'A2', from: 'K', to: 'M', length: 100, area: 10, perimeter: 12, frictionFactor: 0.01 },
      ],
    };
    const r = solveHeat(net, { A1: 6, A2: 4 }, INTAKE);
    const expected = h0 + (7.2 * G * 400) / 12;
    console.log(`mixing: M enthalpy expected ${expected.toFixed(1)} J/kg, computed ${r.nodeStates.M.enthalpy.toFixed(1)}`);
    expect(r.converged).toBe(true);
    expect(r.nodeStates.M.enthalpy).toBeCloseTo(expected, 2);
  });
});
