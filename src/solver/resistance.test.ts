import { describe, it, expect } from 'vitest';
import { atkinsonResistance, airwayResistance, squareLawDrop } from './resistance';
import type { Airway } from '../model/types';

describe('resistance maths', () => {
  it('Atkinson R = kOL/A^3', () => {
    // k=0.01, O=10, L=100, A=5 -> 0.01*10*100 / 125 = 10 / 125 = 0.08
    expect(atkinsonResistance(0.01, 10, 100, 5)).toBeCloseTo(0.08, 12);
  });

  it('throws on non-positive area', () => {
    expect(() => atkinsonResistance(0.01, 10, 100, 0)).toThrow();
  });

  it('square law is signed: p = R·Q·|Q|', () => {
    expect(squareLawDrop(2, 3)).toBe(18);
    expect(squareLawDrop(2, -3)).toBe(-18);
  });

  it('regulator resistance adds to the airway resistance', () => {
    const a: Airway = {
      id: 'x',
      from: 'a',
      to: 'b',
      length: 100,
      area: 5,
      perimeter: 10,
      frictionFactor: 0.01,
      regulatorResistance: 0.02,
    };
    expect(airwayResistance(a)).toBeCloseTo(0.08 + 0.02, 12);
  });

  it('resistanceOverride replaces the geometric resistance (regulator still added)', () => {
    const a: Airway = {
      id: 'x',
      from: 'a',
      to: 'b',
      length: 999,
      area: 1,
      perimeter: 1,
      frictionFactor: 999,
      resistanceOverride: 3,
      regulatorResistance: 0.5,
    };
    expect(airwayResistance(a)).toBeCloseTo(3.5, 12);
  });
});
