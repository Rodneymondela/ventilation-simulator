/**
 * Sequential colour scale (blue -> cyan -> green -> yellow -> red) used to
 * colour airways by the selected display variable. Maps a normalised t in
 * [0,1] to an rgb() string.
 */
const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [37, 99, 235]], // blue-600
  [0.25, [6, 182, 212]], // cyan-500
  [0.5, [34, 197, 94]], // green-500
  [0.75, [234, 179, 8]], // yellow-500
  [1.0, [239, 68, 68]], // red-500
];

export function colorAt(t: number): string {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [t0, c0] = STOPS[i];
    const [t1, c1] = STOPS[i + 1];
    if (x >= t0 && x <= t1) {
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return `rgb(239, 68, 68)`;
}

/** Normalise a value to [0,1] given a min/max range. */
export function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

/** CSS linear-gradient string for a legend bar. */
export function legendGradientCss(): string {
  const stops = STOPS.map(([t, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${(t * 100).toFixed(0)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
