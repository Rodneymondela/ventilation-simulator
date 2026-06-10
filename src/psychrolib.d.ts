/**
 * Minimal type declarations for PsychroLib (https://github.com/psychrometrics/psychrolib),
 * which ships as a plain CommonJS/UMD file with no bundled types. Only the SI-unit
 * functions this project uses are declared. All temperatures °C, pressures Pa,
 * enthalpy J/kg dry air, humidity ratio kg/kg dry air, relative humidity 0–1.
 */
declare module 'psychrolib' {
  /** Unit-system selectors passed to {@link SetUnitSystem}. */
  export const SI: number;
  export const IP: number;
  export function SetUnitSystem(system: number): void;
  export function GetUnitSystem(): number;

  /** Saturation vapour pressure over water/ice at TDryBulb (°C), Pa. */
  export function GetSatVapPres(TDryBulb: number): number;
  /** Humidity ratio of saturated air at TDryBulb (°C) and Pressure (Pa). */
  export function GetSatHumRatio(TDryBulb: number, Pressure: number): number;
  /** Enthalpy of air saturated at TDryBulb (°C) and Pressure (Pa), J/kg dry air. */
  export function GetSatAirEnthalpy(TDryBulb: number, Pressure: number): number;
  /** Moist-air enthalpy from TDryBulb (°C) and HumRatio (kg/kg), J/kg dry air. */
  export function GetMoistAirEnthalpy(TDryBulb: number, HumRatio: number): number;

  export function GetRelHumFromTWetBulb(TDryBulb: number, TWetBulb: number, Pressure: number): number;
  export function GetHumRatioFromTWetBulb(TDryBulb: number, TWetBulb: number, Pressure: number): number;
  export function GetTWetBulbFromRelHum(TDryBulb: number, RelHum: number, Pressure: number): number;
  export function GetTDewPointFromTWetBulb(TDryBulb: number, TWetBulb: number, Pressure: number): number;
  export function GetRelHumFromHumRatio(TDryBulb: number, HumRatio: number, Pressure: number): number;

  /** Dry-bulb (°C) from moist-air enthalpy (J/kg dry air) and humidity ratio (kg/kg). */
  export function GetTDryBulbFromEnthalpyAndHumRatio(MoistAirEnthalpy: number, HumRatio: number): number;
  export function GetTWetBulbFromHumRatio(TDryBulb: number, HumRatio: number, Pressure: number): number;
  export function GetTDewPointFromHumRatio(TDryBulb: number, HumRatio: number, Pressure: number): number;
}
