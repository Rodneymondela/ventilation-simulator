/**
 * Core data model for the mine ventilation network.
 *
 * Units are SI throughout the solver:
 *   length  m
 *   area    m^2
 *   flow Q  m^3/s
 *   pressure Pa
 *   resistance R  Pa·s^2/m^6   (so that p = R·Q^2)
 *
 * NOTE on constants: the Atkinson friction factor `k` and air density are
 * EMPIRICAL and vary by airway type / conditions. They are kept as editable
 * inputs with placeholder defaults that must be VERIFIED against a primary
 * source (e.g. McPherson, *Subsurface Ventilation Engineering*) before any
 * results are trusted for real engineering.
 */

/** A junction in the network. z is depth/elevation (used later for NVP). */
export interface VentNode {
  id: string;
  label?: string;
  x: number;
  y: number;
  z: number;
  /**
   * Optional fixed (boundary) pressure in Pa, e.g. a surface/atmosphere
   * connection. `null`/undefined means it is a free internal junction whose
   * pressure is solved. (Boundary handling is added at the network stage; the
   * baseline loop solver treats the network as closed.)
   */
  fixedPressure?: number | null;

  /**
   * Optional fixed contaminant concentration (arbitrary units, e.g. a fresh-air
   * intake at 0, or a held source concentration). When set, this node's
   * concentration is clamped to this value in the transport solve.
   * APPROXIMATE — not a validated occupational-exposure model.
   */
  contaminantConcentration?: number | null;

  /**
   * Optional contaminant mass-injection rate at this node (units·m³/s, i.e.
   * concentration × flow). Added to the node's contaminant balance.
   */
  contaminantInjection?: number | null;
}

/** One (pressure, flow) sample of a fan characteristic curve. */
export interface FanCurvePoint {
  /** Flow, m^3/s */
  q: number;
  /** Pressure rise, Pa */
  p: number;
}

/** A fan attached to an airway. Curve is interpolated piecewise-linearly. */
export interface Fan {
  id: string;
  name?: string;
  /** Characteristic curve points; need not be pre-sorted. */
  curve: FanCurvePoint[];
}

/** A branch connecting two nodes (a drift / roadway / shaft). */
export interface Airway {
  id: string;
  label?: string;
  from: string;
  to: string;
  /** Length L, m */
  length: number;
  /** Cross-sectional area A, m^2 */
  area: number;
  /** Perimeter O, m */
  perimeter: number;
  /** Atkinson friction factor k (empirical — verify against a primary source). */
  frictionFactor: number;
  /** Extra resistance from a regulator/damper, Pa·s^2/m^6. */
  regulatorResistance?: number;
  /** Optional fan on this branch (boost in the from->to direction). */
  fan?: Fan | null;
  /** Free-text airway type label (e.g. "intake", "return", "shaft"). */
  type?: string;
  /**
   * If set, this resistance (Pa·s^2/m^6) is used INSTEAD of the Atkinson
   * geometric calculation. Useful for tests and manually-specified branches.
   * The regulator resistance (if any) is still added on top.
   */
  resistanceOverride?: number | null;
}

export interface VentNetwork {
  nodes: VentNode[];
  airways: Airway[];
}
