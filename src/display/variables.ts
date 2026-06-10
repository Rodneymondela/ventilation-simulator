import type { AirwayResult } from '../solver';

/**
 * Display variables and unit handling for colouring/labelling airways.
 *
 * All solver values are SI. A unit defines a `factor` such that
 *   displayValue = siValue * factor
 * and a number of decimals for labels.
 */

export type DisplayVariableId =
  | 'airflow'
  | 'velocity'
  | 'pressure'
  | 'resistance'
  | 'contaminant'
  | 'dryBulb'
  | 'wetBulb'
  | 'relHum'
  | 'sigmaHeat';

export interface UnitDef {
  id: string;
  label: string;
  /** displayValue = siValue * factor */
  factor: number;
  decimals: number;
}

export interface DisplayVariableDef {
  id: DisplayVariableId;
  label: string;
  /** Extract the SI value for this variable from a solved airway result. */
  siValue: (r: AirwayResult) => number;
  /** Whether to colour by magnitude (|value|) — true for signed flow/velocity. */
  useMagnitude: boolean;
  units: UnitDef[];
}

export const DISPLAY_VARIABLES: Record<DisplayVariableId, DisplayVariableDef> = {
  airflow: {
    id: 'airflow',
    label: 'Airflow',
    siValue: (r) => r.Q,
    useMagnitude: true,
    units: [
      { id: 'm3s', label: 'm³/s', factor: 1, decimals: 2 },
      { id: 'm3min', label: 'm³/min', factor: 60, decimals: 1 },
      { id: 'ls', label: 'L/s', factor: 1000, decimals: 0 },
      { id: 'cfm', label: 'cfm', factor: 2118.88, decimals: 0 },
    ],
  },
  velocity: {
    id: 'velocity',
    label: 'Velocity',
    siValue: (r) => r.velocity,
    useMagnitude: true,
    units: [
      { id: 'ms', label: 'm/s', factor: 1, decimals: 2 },
      { id: 'fpm', label: 'ft/min', factor: 196.85, decimals: 0 },
    ],
  },
  pressure: {
    id: 'pressure',
    label: 'Pressure drop',
    siValue: (r) => r.pressureDrop,
    useMagnitude: true,
    units: [
      { id: 'pa', label: 'Pa', factor: 1, decimals: 1 },
      { id: 'kpa', label: 'kPa', factor: 0.001, decimals: 3 },
      { id: 'inwg', label: 'in. w.g.', factor: 1 / 249.0889, decimals: 3 },
      { id: 'mmwg', label: 'mm w.g.', factor: 1 / 9.80665, decimals: 2 },
    ],
  },
  resistance: {
    id: 'resistance',
    label: 'Resistance',
    siValue: (r) => r.R,
    useMagnitude: false,
    units: [{ id: 'si', label: 'Pa·s²/m⁶', factor: 1, decimals: 4 }],
  },
  contaminant: {
    id: 'contaminant',
    label: 'Contaminant',
    siValue: (r) => r.concentration ?? 0,
    useMagnitude: false,
    units: [{ id: 'rel', label: 'units', factor: 1, decimals: 2 }],
  },
  // Heat layers (populated only after a thermodynamic march): the airway's
  // outlet air state. See solver/heat.ts and solver/psychrometrics.ts.
  dryBulb: {
    id: 'dryBulb',
    label: 'Dry-bulb temp',
    siValue: (r) => r.dryBulb ?? 0,
    useMagnitude: false,
    units: [{ id: 'c', label: '°C', factor: 1, decimals: 1 }],
  },
  wetBulb: {
    id: 'wetBulb',
    label: 'Wet-bulb temp',
    siValue: (r) => r.wetBulb ?? 0,
    useMagnitude: false,
    units: [{ id: 'c', label: '°C', factor: 1, decimals: 1 }],
  },
  relHum: {
    id: 'relHum',
    label: 'Relative humidity',
    siValue: (r) => r.relHum ?? 0,
    useMagnitude: false,
    units: [{ id: 'pct', label: '%', factor: 100, decimals: 1 }],
  },
  sigmaHeat: {
    id: 'sigmaHeat',
    label: 'Sigma heat',
    siValue: (r) => r.sigmaHeat ?? 0,
    useMagnitude: false,
    units: [
      { id: 'kjkg', label: 'kJ/kg', factor: 0.001, decimals: 2 },
      { id: 'jkg', label: 'J/kg', factor: 1, decimals: 0 },
    ],
  },
};

export const DISPLAY_VARIABLE_LIST = Object.values(DISPLAY_VARIABLES);

export interface DisplaySetting {
  variable: DisplayVariableId;
  unitId: string;
}

export function getUnit(variable: DisplayVariableId, unitId: string): UnitDef {
  const def = DISPLAY_VARIABLES[variable];
  return def.units.find((u) => u.id === unitId) ?? def.units[0];
}

export function formatValue(setting: DisplaySetting, r: AirwayResult): string {
  const def = DISPLAY_VARIABLES[setting.variable];
  const unit = getUnit(setting.variable, setting.unitId);
  const v = def.siValue(r) * unit.factor;
  return `${v.toFixed(unit.decimals)} ${unit.label}`;
}

/** Value used for colour mapping (respects magnitude vs signed). */
export function colorValue(variable: DisplayVariableId, r: AirwayResult): number {
  const def = DISPLAY_VARIABLES[variable];
  const v = def.siValue(r);
  return def.useMagnitude ? Math.abs(v) : v;
}
