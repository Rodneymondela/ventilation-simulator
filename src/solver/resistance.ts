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

/** Default Atkinson flow exponent: fully turbulent square law (p = R·Q²). */
export const DEFAULT_FLOW_EXPONENT = 2;

/**
 * The Atkinson flow exponent n for an airway, clamped to the physically
 * meaningful band [1, 2]: 1 = laminar (p ∝ Q), 2 = fully turbulent (p ∝ Q²).
 */
export function airwayExponent(a: Airway): number {
  const n = a.flowExponent ?? DEFAULT_FLOW_EXPONENT;
  if (!Number.isFinite(n)) return DEFAULT_FLOW_EXPONENT;
  return Math.min(2, Math.max(1, n));
}

/**
 * Signed Atkinson pressure drop for exponent n:
 *
 *   p = R · |Q|^(n-1) · Q
 *
 * Reversing Q reverses the sign of the head loss. n = 2 recovers the turbulent
 * square law R·Q·|Q|; n = 1 is the laminar linear law R·Q.
 */
export function pressureDrop(R: number, Q: number, n: number = DEFAULT_FLOW_EXPONENT): number {
  return R * Math.abs(Q) ** (n - 1) * Q;
}

/**
 * Square-law pressure drop, signed to preserve flow direction (the n = 2 case
 * of {@link pressureDrop}): p = R · Q · |Q|.
 */
export function squareLawDrop(R: number, Q: number): number {
  return R * Q * Math.abs(Q);
}
