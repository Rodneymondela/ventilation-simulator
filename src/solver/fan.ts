import type { Fan, FanCurvePoint } from '../model/types';

function sortedCurve(fan: Fan): FanCurvePoint[] {
  return [...fan.curve].sort((a, b) => a.q - b.q);
}

/**
 * Fan pressure rise (Pa) at flow `q` (m^3/s), by piecewise-linear interpolation
 * of the characteristic curve. Outside the curve's flow range the nearest end
 * segment's slope is used to extrapolate (so the solver always has a value).
 */
export function fanPressure(fan: Fan, q: number): number {
  if (fan.off) return 0;
  const pts = sortedCurve(fan);
  if (pts.length === 0) return 0;
  if (pts.length === 1) return pts[0].p;

  const first = pts[0];
  const last = pts[pts.length - 1];

  if (q <= first.q) {
    const slope = (pts[1].p - first.p) / (pts[1].q - first.q);
    return first.p + slope * (q - first.q);
  }
  if (q >= last.q) {
    const prev = pts[pts.length - 2];
    const slope = (last.p - prev.p) / (last.q - prev.q);
    return last.p + slope * (q - last.q);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (q >= pts[i].q && q <= pts[i + 1].q) {
      const slope = (pts[i + 1].p - pts[i].p) / (pts[i + 1].q - pts[i].q);
      return pts[i].p + slope * (q - pts[i].q);
    }
  }
  return last.p; // unreachable
}

/**
 * dP/dQ of the fan curve at flow `q` (Pa per m^3/s). Used by the solver's
 * Newton step. Typically negative (pressure falls as flow rises).
 */
export function fanSlope(fan: Fan, q: number): number {
  if (fan.off) return 0;
  const pts = sortedCurve(fan);
  if (pts.length < 2) return 0;

  const first = pts[0];
  const last = pts[pts.length - 1];

  if (q <= first.q) return (pts[1].p - first.p) / (pts[1].q - first.q);
  if (q >= last.q) {
    const prev = pts[pts.length - 2];
    return (last.p - prev.p) / (last.q - prev.q);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (q >= pts[i].q && q <= pts[i + 1].q) {
      return (pts[i + 1].p - pts[i].p) / (pts[i + 1].q - pts[i].q);
    }
  }
  return 0;
}

/** Operating state of a fan, for display and status glyphs. */
export type FanState = 'normal' | 'off' | 'reverse' | 'stalled';

/**
 * Classify a fan's operating state at solved flow `q` (m^3/s, positive = the
 * fan's from->to boost direction):
 *   - `off`     — switched off; contributes no pressure
 *   - `reverse` — air flows backward through the fan (q < 0)
 *   - `stalled` — operating on the rising (positive-slope) part of the curve,
 *                 the aerodynamically unstable region near/left of the peak
 *   - `normal`  — forward flow on the stable (falling) part of the curve
 *
 * The stall test uses the local curve slope, so it only fires for fan curves
 * that actually have a rising region; a purely monotonic-falling curve never
 * reports `stalled`.
 */
export function fanState(fan: Fan, q: number): FanState {
  if (fan.off) return 'off';
  if (q < 0) return 'reverse';
  if (fanSlope(fan, q) > 0) return 'stalled';
  return 'normal';
}
