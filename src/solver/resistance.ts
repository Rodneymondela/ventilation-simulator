import type { Airway } from '../model/types';

/**
 * Atkinson airway resistance.
 *
 *   R = (k · O · L) / A^3        [Pa·s^2/m^6]
 *
 * This equation FORM is standard mine-ventilation fundamentals. The friction
 * factor `k` itself is empirical — verify against a primary source.
 *
 * @param k friction factor (Atkinson), kg/m^3
 * @param O perimeter, m
 * @param L length, m
 * @param A cross-sectional area, m^2
 */
export function atkinsonResistance(k: number, O: number, L: number, A: number): number {
  if (A <= 0) throw new Error('atkinsonResistance: area A must be > 0');
  return (k * O * L) / A ** 3;
}

/**
 * Effective resistance of an airway, including any regulator resistance and
 * honouring a manual `resistanceOverride` when present.
 */
export function airwayResistance(a: Airway): number {
  const regulator = a.regulatorResistance ?? 0;
  if (a.resistanceOverride != null) {
    return a.resistanceOverride + regulator;
  }
  return atkinsonResistance(a.frictionFactor, a.perimeter, a.length, a.area) + regulator;
}

/**
 * Square-law pressure drop, signed to preserve flow direction:
 *
 *   p = R · Q · |Q|
 *
 * so that reversing Q reverses the sign of the head loss.
 */
export function squareLawDrop(R: number, Q: number): number {
  return R * Q * Math.abs(Q);
}
