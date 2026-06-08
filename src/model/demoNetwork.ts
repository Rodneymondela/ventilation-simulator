import type { VentNetwork } from './types';

/**
 * Demo network: a closed circuit with a main fan and a parallel split — 5
 * airways, one fan, one mesh (satisfies "at least 5 airways with one fan and
 * one mesh"). Friction factor k = 0.012 kg/m³ is a PLACEHOLDER — verify against
 * a primary source before trusting results.
 */
const k = 0.012; // PLACEHOLDER Atkinson friction factor — verify against a primary source

export function createDemoNetwork(): VentNetwork {
  return {
    nodes: [
      // A holds fresh air (contaminant 0); C injects a contaminant (e.g. dust
      // at a working area) so the transport layer shows a gradient on solve.
      { id: 'A', label: 'A (fan inlet)', x: 120, y: 360, z: 0, contaminantConcentration: 0 },
      { id: 'B', label: 'B', x: 360, y: 160, z: -50 },
      { id: 'C', label: 'C (split)', x: 640, y: 160, z: -120, contaminantInjection: 100 },
      { id: 'D', label: 'D (junction)', x: 640, y: 520, z: -120 },
    ],
    airways: [
      {
        id: 'A1',
        label: 'Main fan drift',
        from: 'A',
        to: 'B',
        length: 300,
        area: 16,
        perimeter: 16,
        frictionFactor: k,
        type: 'intake',
        fan: {
          id: 'fan1',
          name: 'Main fan',
          // Falling characteristic: high pressure at low flow, falling with flow.
          curve: [
            { q: 0, p: 3000 },
            { q: 50, p: 2600 },
            { q: 100, p: 1800 },
            { q: 150, p: 700 },
            { q: 200, p: 0 },
          ],
        },
      },
      {
        id: 'A2',
        label: 'Level drive',
        from: 'B',
        to: 'C',
        length: 400,
        area: 12,
        perimeter: 14,
        frictionFactor: k,
        type: 'intake',
      },
      {
        id: 'A3',
        label: 'Parallel branch 1',
        from: 'C',
        to: 'D',
        length: 500,
        area: 10,
        perimeter: 13,
        frictionFactor: k,
        type: 'working',
      },
      {
        id: 'A4',
        label: 'Parallel branch 2',
        from: 'C',
        to: 'D',
        length: 500,
        area: 6,
        perimeter: 10,
        frictionFactor: k,
        type: 'working',
      },
      {
        id: 'A5',
        label: 'Return airway',
        from: 'D',
        to: 'A',
        length: 600,
        area: 14,
        perimeter: 15,
        frictionFactor: k,
        type: 'return',
      },
    ],
  };
}
