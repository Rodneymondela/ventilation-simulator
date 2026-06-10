/**
 * Psychrometric core for the thermodynamic / heat simulation.
 *
 * SOURCING (per CLAUDE.md rule #1 — no psychrometric maths is written from memory
 * here): every saturation-vapour-pressure, humidity-ratio, enthalpy, wet-bulb and
 * dew-point relation comes from **PsychroLib**, a peer-reviewed, MIT-licensed
 * library implementing the **ASHRAE 2017 Handbook of Fundamentals, Chapter 1**
 * psychrometric formulations:
 *
 *   D. Meyer & L. Thevenard (2019). "PsychroLib: a library of psychrometric
 *   functions to calculate thermodynamic properties of air." Journal of Open
 *   Source Software, 4(33), 1137. https://github.com/psychrometrics/psychrolib
 *
 * "Sigma heat" (S) is the mine-ventilation quantity used by McPherson
 * (*Subsurface Ventilation and Environmental Engineering*): the enthalpy of air
 * SATURATED at the wet-bulb temperature, per kg of dry air. It is computed here
 * as PsychroLib's `GetSatAirEnthalpy(wetBulb, pressure)`.
 *
 * VERIFY BEFORE USE: the sigma-heat identity (S = enthalpy of saturated air at
 * t_wb) and all derived climate numbers should be checked against your own
 * ventilation reference before any occupational-hygiene use — see CLAUDE.md.
 *
 * Units (SI): temperatures °C, pressure Pa, enthalpy J/kg dry air, humidity /
 * moisture ratio kg water / kg dry air, relative humidity as a 0–1 fraction.
 */
import {
  SI,
  SetUnitSystem,
  GetSatVapPres,
  GetSatAirEnthalpy,
  GetMoistAirEnthalpy,
  GetRelHumFromTWetBulb,
  GetHumRatioFromTWetBulb,
  GetTDewPointFromTWetBulb,
  GetTDryBulbFromEnthalpyAndHumRatio,
  GetTWetBulbFromHumRatio,
  GetRelHumFromHumRatio,
  GetTDewPointFromHumRatio,
} from 'psychrolib';

// PsychroLib is a singleton; fix it to SI units once at module load.
SetUnitSystem(SI);

/** Standard sea-level atmospheric pressure, Pa. Barometric pressure is editable per scenario. */
export const STANDARD_PRESSURE = 101325;

/** A complete moist-air state at one point (e.g. an airway end). */
export interface AirState {
  /** Dry-bulb temperature, °C. */
  dryBulb: number;
  /** Wet-bulb temperature, °C (clamped to ≤ dry-bulb). */
  wetBulb: number;
  /** Barometric pressure, Pa. */
  pressure: number;
  /** Relative humidity, 0–1. */
  relHum: number;
  /** Moisture content (humidity ratio), kg water / kg dry air. */
  humidityRatio: number;
  /** Moist-air enthalpy, J/kg dry air. */
  enthalpy: number;
  /** Sigma heat (enthalpy of air saturated at the wet-bulb temperature), J/kg dry air. */
  sigmaHeat: number;
  /** Dew-point temperature, °C. */
  dewPoint: number;
}

/** Saturation vapour pressure of water at temperature `t` (°C), in Pa. */
export function saturationVapourPressure(t: number): number {
  return GetSatVapPres(t);
}

/**
 * Sigma heat S at a wet-bulb temperature and barometric pressure, J/kg dry air —
 * the enthalpy of air saturated at the wet-bulb temperature (McPherson).
 */
export function sigmaHeat(wetBulb: number, pressure = STANDARD_PRESSURE): number {
  return GetSatAirEnthalpy(wetBulb, pressure);
}

/**
 * Full air state from dry-bulb, wet-bulb and barometric pressure. Wet-bulb is
 * clamped to ≤ dry-bulb (a wet-bulb above dry-bulb is unphysical and makes the
 * underlying relations throw).
 */
export function airStateFromBulbs(
  dryBulb: number,
  wetBulb: number,
  pressure = STANDARD_PRESSURE,
): AirState {
  const twb = Math.min(wetBulb, dryBulb);
  const humidityRatio = GetHumRatioFromTWetBulb(dryBulb, twb, pressure);
  return {
    dryBulb,
    wetBulb: twb,
    pressure,
    relHum: GetRelHumFromTWetBulb(dryBulb, twb, pressure),
    humidityRatio,
    enthalpy: GetMoistAirEnthalpy(dryBulb, humidityRatio),
    sigmaHeat: GetSatAirEnthalpy(twb, pressure),
    dewPoint: GetTDewPointFromTWetBulb(dryBulb, twb, pressure),
  };
}

/**
 * Full air state from moist-air enthalpy (J/kg dry air), moisture content
 * (humidity ratio, kg/kg) and barometric pressure. This is the inverse used by
 * the heat march: enthalpy and moisture are the conserved quantities transported
 * along airways and mixed at junctions; the temperatures are recovered from them.
 */
export function airStateFromEnthalpy(
  enthalpy: number,
  humidityRatio: number,
  pressure = STANDARD_PRESSURE,
): AirState {
  const w = Math.max(humidityRatio, 0);
  const dryBulb = GetTDryBulbFromEnthalpyAndHumRatio(enthalpy, w);
  const wetBulb = GetTWetBulbFromHumRatio(dryBulb, w, pressure);
  return {
    dryBulb,
    wetBulb,
    pressure,
    relHum: GetRelHumFromHumRatio(dryBulb, w, pressure),
    humidityRatio: w,
    enthalpy,
    sigmaHeat: GetSatAirEnthalpy(wetBulb, pressure),
    dewPoint: GetTDewPointFromHumRatio(dryBulb, w, pressure),
  };
}
