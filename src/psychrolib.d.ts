/**
 * Minimal type declarations for PsychroLib (https://github.com/psychrometrics/psychrolib),
 * which ships as a plain CommonJS/UMD file with no bundled types.
 *
 * IMPORTANT: PsychroLib's methods use `this` internally (e.g. `this.IP`), so they
 * must be called ON the singleton object (`psychrolib.GetX(...)`), not as detached
 * named imports (`import { GetX }` then `GetX(...)` loses `this` and throws). Hence
 * this is declared as a default export and consumed as `import psychrolib from ...`.
 *
 * Only the SI-unit functions this project uses are declared. Temperatures °C,
 * pressures Pa, enthalpy J/kg dry air, humidity ratio kg/kg dry air, RH 0–1.
 */
declare module 'psychrolib' {
  interface PsychroLib {
    /** Unit-system selectors passed to {@link PsychroLib.SetUnitSystem}. */
    readonly SI: number;
    readonly IP: number;
    SetUnitSystem(system: number): void;
    GetUnitSystem(): number;

    /** Saturation vapour pressure over water/ice at TDryBulb (°C), Pa. */
    GetSatVapPres(TDryBulb: number): number;
    /** Humidity ratio of saturated air at TDryBulb (°C) and Pressure (Pa). */
    GetSatHumRatio(TDryBulb: number, Pressure: number): number;
    /** Enthalpy of air saturated at TDryBulb (°C) and Pressure (Pa), J/kg dry air. */
    GetSatAirEnthalpy(TDryBulb: number, Pressure: number): number;
    /** Moist-air enthalpy from TDryBulb (°C) and HumRatio (kg/kg), J/kg dry air. */
    GetMoistAirEnthalpy(TDryBulb: number, HumRatio: number): number;

    GetRelHumFromTWetBulb(TDryBulb: number, TWetBulb: number, Pressure: number): number;
    GetHumRatioFromTWetBulb(TDryBulb: number, TWetBulb: number, Pressure: number): number;
    GetTWetBulbFromRelHum(TDryBulb: number, RelHum: number, Pressure: number): number;
    GetTDewPointFromTWetBulb(TDryBulb: number, TWetBulb: number, Pressure: number): number;
    GetRelHumFromHumRatio(TDryBulb: number, HumRatio: number, Pressure: number): number;

    /** Dry-bulb (°C) from moist-air enthalpy (J/kg dry air) and humidity ratio (kg/kg). */
    GetTDryBulbFromEnthalpyAndHumRatio(MoistAirEnthalpy: number, HumRatio: number): number;
    GetTWetBulbFromHumRatio(TDryBulb: number, HumRatio: number, Pressure: number): number;
    GetTDewPointFromHumRatio(TDryBulb: number, HumRatio: number, Pressure: number): number;
  }
  const psychrolib: PsychroLib;
  export default psychrolib;
}
