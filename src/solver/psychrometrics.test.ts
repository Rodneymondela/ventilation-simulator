import { describe, it, expect } from 'vitest';
import psychrolib from 'psychrolib';
import { airStateFromBulbs, saturationVapourPressure, STANDARD_PRESSURE } from './psychrometrics';

psychrolib.SetUnitSystem(psychrolib.SI);

/**
 * MANDATORY psychrometric core test (CLAUDE.md rule #2 / spec). Validates the
 * PsychroLib (ASHRAE 2017) core before any heat is wired into the network. We
 * check it against quantities that are verifiable WITHOUT re-deriving the
 * psychrometric maths: water's physical saturation points, the saturation
 * identity (RH = 100% when dry-bulb = wet-bulb), the sigma-heat definition, and
 * a self-consistent dry-bulb + wet-bulb worked point. Expected-vs-computed is
 * printed for each.
 */
describe('psychrometric core (PsychroLib / ASHRAE 2017)', () => {
  it('saturation vapour pressure passes through water’s physical points', () => {
    const pTriple = saturationVapourPressure(0.01); // triple point ≈ 611.66 Pa
    const pBoil = saturationVapourPressure(100); // normal boiling ≈ 101325 Pa
    console.log(`Psat(0.01°C): expected ~611.66 Pa, computed ${pTriple.toFixed(2)} Pa`);
    console.log(`Psat(100°C):  expected ~101325 Pa, computed ${pBoil.toFixed(0)} Pa`);
    expect(pTriple).toBeGreaterThan(609);
    expect(pTriple).toBeLessThan(614);
    expect(Math.abs(pBoil - 101325) / 101325).toBeLessThan(0.01);
  });

  it('reports 100% relative humidity at saturation (dry-bulb = wet-bulb)', () => {
    const s = airStateFromBulbs(20, 20, STANDARD_PRESSURE);
    console.log(`Tdb=Twb=20°C → RH expected 1.000, computed ${s.relHum.toFixed(4)}`);
    expect(s.relHum).toBeCloseTo(1.0, 2);
  });

  it('sigma heat equals moist-air enthalpy when the air is saturated', () => {
    // By definition sigma heat = enthalpy of saturated air at the wet-bulb temp;
    // at saturation (Tdb = Twb = T) that must equal the moist-air enthalpy of the
    // saturated air at T.
    const T = 20;
    const sigma = psychrolib.GetSatAirEnthalpy(T, STANDARD_PRESSURE);
    const enthalpy = psychrolib.GetMoistAirEnthalpy(T, psychrolib.GetSatHumRatio(T, STANDARD_PRESSURE));
    console.log(`saturated 20°C: sigmaHeat=${sigma.toFixed(1)} J/kg, enthalpy=${enthalpy.toFixed(1)} J/kg`);
    expect(sigma).toBeCloseTo(enthalpy, 0);
  });

  it('worked point Tdb=30°C, Twb=22°C, 101325 Pa is self-consistent', () => {
    const s = airStateFromBulbs(30, 22, STANDARD_PRESSURE);
    console.log(
      `Tdb=30 Twb=22 P=101325: RH=${(s.relHum * 100).toFixed(1)}% ` +
        `w=${(s.humidityRatio * 1000).toFixed(2)} g/kg ` +
        `h=${(s.enthalpy / 1000).toFixed(2)} kJ/kg ` +
        `sigma=${(s.sigmaHeat / 1000).toFixed(2)} kJ/kg ` +
        `Tdp=${s.dewPoint.toFixed(2)}°C`,
    );
    // Plausibility bounds (not invented reference values): partial saturation,
    // the physical ordering dew point ≤ wet-bulb ≤ dry-bulb, moisture positive.
    expect(s.relHum).toBeGreaterThan(0);
    expect(s.relHum).toBeLessThan(1);
    expect(s.humidityRatio).toBeGreaterThan(0);
    expect(s.dewPoint).toBeLessThanOrEqual(s.wetBulb);
    expect(s.wetBulb).toBeLessThanOrEqual(s.dryBulb);
    // Independent cross-check: the wet-bulb recovered from the computed RH must
    // return to the input 22°C (round-trip through a different PsychroLib route).
    const twbBack = psychrolib.GetTWetBulbFromRelHum(30, s.relHum, STANDARD_PRESSURE);
    console.log(`  round-trip wet-bulb: expected 22.00°C, computed ${twbBack.toFixed(2)}°C`);
    expect(twbBack).toBeCloseTo(22, 1);
  });
});
