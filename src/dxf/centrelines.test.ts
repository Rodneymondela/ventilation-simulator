import { describe, it, expect } from 'vitest';
import type { VentNetwork } from '../model/types';
import { centrelinesToNetwork, type Centreline } from './centrelines';
import { parseDxf } from './importDxf';

/** Count connected components of the network graph (union-find over airways). */
function componentCount(net: VentNetwork): number {
  const parent = new Map(net.nodes.map((n) => [n.id, n.id] as const));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const a of net.airways) parent.set(find(a.from), find(a.to));
  return new Set([...parent.keys()].map(find)).size;
}

const ATTRS = { area: 12, perimeter: 14, frictionFactor: 0.012 };

describe('DXF centreline -> network conversion (snapping & connectivity)', () => {
  it('builds a connected network from a loop + spur with shared endpoints', () => {
    // Square loop (0,0)-(10,0)-(10,10)-(0,10) + a spur off the (10,10) corner.
    const lines: Centreline[] = [
      { layer: 'c', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { layer: 'c', points: [{ x: 10, y: 0 }, { x: 10, y: 10 }] },
      { layer: 'c', points: [{ x: 10, y: 10 }, { x: 0, y: 10 }] },
      { layer: 'c', points: [{ x: 0, y: 10 }, { x: 0, y: 0 }] },
      { layer: 'c', points: [{ x: 10, y: 10 }, { x: 20, y: 10 }] },
    ];
    const { network, counts } = centrelinesToNetwork(lines, { snapTolerance: 0.01, defaults: ATTRS });
    console.log('loop+spur:', JSON.stringify(counts));
    expect(counts.nodesCreated).toBe(5); // 4 corners + 1 spur end
    expect(counts.airwaysCreated).toBe(5); // 4 loop + 1 spur
    expect(counts.endpointsSnapped).toBe(5); // each shared endpoint after the first
    expect(componentCount(network)).toBe(1); // fully connected -> solvable
  });

  it('snaps endpoints within tolerance, and does not snap beyond it', () => {
    // Two collinear lines that nearly meet at x=10 (gap 0.3).
    const lines: Centreline[] = [
      { layer: 'c', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
      { layer: 'c', points: [{ x: 10.3, y: 0 }, { x: 20, y: 0 }] },
    ];
    const merged = centrelinesToNetwork(lines, { snapTolerance: 0.5, defaults: ATTRS });
    console.log('tol 0.5:', JSON.stringify(merged.counts));
    expect(merged.counts.nodesCreated).toBe(3); // the 0.3 gap merges
    expect(merged.counts.endpointsSnapped).toBe(1);
    expect(componentCount(merged.network)).toBe(1);

    const apart = centrelinesToNetwork(lines, { snapTolerance: 0.1, defaults: ATTRS });
    console.log('tol 0.1:', JSON.stringify(apart.counts));
    expect(apart.counts.nodesCreated).toBe(4); // gap too big to merge
    expect(apart.counts.endpointsSnapped).toBe(0);
    expect(componentCount(apart.network)).toBe(2); // disconnected
  });

  it('does NOT auto-join lines that merely cross in 2D', () => {
    // Horizontal and vertical lines crossing at (5,5); neither has an endpoint there.
    const lines: Centreline[] = [
      { layer: 'c', points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] },
      { layer: 'c', points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] },
    ];
    const { network, counts } = centrelinesToNetwork(lines, { snapTolerance: 0.5, defaults: ATTRS });
    console.log('crossing:', JSON.stringify(counts));
    expect(counts.nodesCreated).toBe(4); // 2 endpoints each, no node at the crossing
    expect(counts.airwaysCreated).toBe(2);
    expect(counts.endpointsSnapped).toBe(0);
    expect(componentCount(network)).toBe(2); // two separate airways, not joined
    // No node sits at the crossing point (5,5).
    expect(network.nodes.some((n) => n.x === 5 && n.y === 5)).toBe(false);
  });

  it('single-mode polyline becomes one airway with path length', () => {
    const lines: Centreline[] = [
      { layer: 'c', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    ];
    const { network, counts } = centrelinesToNetwork(lines, { polylineMode: 'single', defaults: ATTRS });
    console.log('single mode length:', network.airways[0]?.length);
    expect(counts.nodesCreated).toBe(2);
    expect(counts.airwaysCreated).toBe(1);
    expect(network.airways[0].length).toBeCloseTo(20, 6); // 10 + 10 path length
  });
});

describe('DXF parsing (dxf-parser integration)', () => {
  const dxf = [
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', 'centre', '10', '0', '20', '0', '30', '0', '11', '10', '21', '0', '31', '0',
    '0', 'LWPOLYLINE', '8', 'centre', '90', '3', '70', '0', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10',
    '0', 'TEXT', '8', 'labels', '10', '5', '20', '5', '1', 'Shaft',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n');

  it('extracts centrelines, labels and layers', () => {
    const parsed = parseDxf(dxf);
    console.log('parsed layers:', parsed.layers, 'centrelines:', parsed.centrelines.length, 'labels:', parsed.labels.length);
    expect(parsed.centrelines.length).toBe(2); // LINE + LWPOLYLINE
    expect(parsed.labels.length).toBe(1);
    expect(parsed.labels[0].text).toBe('Shaft');
    expect(parsed.layers).toContain('centre');
    expect(parsed.layers).toContain('labels');
  });
});
