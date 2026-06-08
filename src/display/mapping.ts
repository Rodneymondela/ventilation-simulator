import type { AirwayResult } from '../solver';
import { colorValue, type DisplayVariableId } from './variables';
import { colorAt, normalize } from './colorScale';

export interface ColorRange {
  min: number;
  max: number;
}

export function computeRange(results: AirwayResult[], variable: DisplayVariableId): ColorRange {
  if (results.length === 0) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const r of results) {
    const v = colorValue(variable, r);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}

export function colorForValue(value: number, range: ColorRange): string {
  return colorAt(normalize(value, range.min, range.max));
}
