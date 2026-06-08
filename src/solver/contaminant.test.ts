import { describe, it, expect } from 'vitest';
import { solveContaminant } from './contaminant';
import type { VentNetwork } from '../model/types';

const node = (id: string, extra: Partial<VentNetwork['nodes'][number]> = {}) => ({
  id,
  x: 0,
  y: 0,
  z: 0,
  ...extra,
});

const airway = (id: string, from: string, to: string): VentNetwork['airways'][number] => ({
  id,
  from,
  to,
  length: 1,
  area: 1,
  perimeter: 1,
  frictionFactor: 0,
});

describe('contaminant transport — flow-weighted mixing', () => {
  it('series path with injection: C = injection / flow', () => {
    // A(fresh=0) --10--> B(+50 inj) --10--> C
    // C_B = (10*0 + 50) / 10 = 5 ; C_C = (10*5)/10 = 5
    const network: VentNetwork = {
      nodes: [node('A', { contaminantConcentration: 0 }), node('B', { contaminantInjection: 50 }), node('C')],
      airways: [airway('AB', 'A', 'B'), airway('BC', 'B', 'C')],
    };
    const r = solveContaminant(network, { AB: 10, BC: 10 });
    expect(r.converged).toBe(true);
    expect(r.nodeConcentration.B).toBeCloseTo(5, 6);
    expect(r.nodeConcentration.C).toBeCloseTo(5, 6);
    expect(r.airwayConcentration.BC).toBeCloseTo(5, 6);
    expect(r.airwayConcentration.AB).toBeCloseTo(0, 6);
  });

  it('junction mixing is flow-weighted', () => {
    // S1(10) --1--> J ; S2(0) --3--> J ; J --4--> E
    // C_J = (1*10 + 3*0) / 4 = 2.5
    const network: VentNetwork = {
      nodes: [
        node('S1', { contaminantConcentration: 10 }),
        node('S2', { contaminantConcentration: 0 }),
        node('J'),
        node('E'),
      ],
      airways: [airway('S1J', 'S1', 'J'), airway('S2J', 'S2', 'J'), airway('JE', 'J', 'E')],
    };
    const r = solveContaminant(network, { S1J: 1, S2J: 3, JE: 4 });
    expect(r.converged).toBe(true);
    expect(r.nodeConcentration.J).toBeCloseTo(2.5, 6);
    expect(r.nodeConcentration.E).toBeCloseTo(2.5, 6);
  });

  it('recirculating loop with one held source converges to uniform concentration', () => {
    // closed loop A->B->C->A, A held at 8 -> everything reaches 8
    const network: VentNetwork = {
      nodes: [node('A', { contaminantConcentration: 8 }), node('B'), node('C')],
      airways: [airway('AB', 'A', 'B'), airway('BC', 'B', 'C'), airway('CA', 'C', 'A')],
    };
    const r = solveContaminant(network, { AB: 5, BC: 5, CA: 5 });
    expect(r.converged).toBe(true);
    expect(r.nodeConcentration.B).toBeCloseTo(8, 6);
    expect(r.nodeConcentration.C).toBeCloseTo(8, 6);
  });
});
