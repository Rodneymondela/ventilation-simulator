import type { VentNetwork, VentNode, Airway } from '../model/types';

/**
 * Centreline geometry -> ventilation network conversion (the hard, safety-critical
 * part of DXF import — see CLAUDE.md rule #6). This module is PURE and
 * framework-independent (no DXF-library or React imports) so the snapping and
 * connectivity logic is unit-tested in isolation; the DXF library only feeds it
 * geometry (see ./importDxf.ts).
 *
 * Rules that keep an import from silently corrupting the network:
 *  - Nodes are created only at centreline ENDPOINTS (and polyline vertices in
 *    "chain" mode). Endpoints within `snapTolerance` of an existing node merge
 *    onto it, so lines drawn to meet share one node.
 *  - Lines that merely CROSS in 2D are never auto-joined: a crossing point is not
 *    an endpoint of either line, so no node is placed there.
 *  - Counts of nodes/airways created and endpoints snapped are reported so the
 *    user can sanity-check connectivity.
 */

export interface Pt3 {
  x: number;
  y: number;
  z?: number;
}

/** One centreline: a LINE (2 points) or a POLYLINE/LWPOLYLINE (a point chain). */
export interface Centreline {
  layer: string;
  points: Pt3[];
}

export interface CentrelineImportOptions {
  /** Endpoints within this distance (model units, after scaling) merge to one node. */
  snapTolerance?: number;
  /** "chain" = one airway per polyline segment (vertices become nodes); "single" = one airway end-to-end, length = path length. */
  polylineMode?: 'chain' | 'single';
  /** Translation applied after scaling, in model units. */
  offset?: { x: number; y: number; z: number };
  /** Uniform scale applied to the raw coordinates. */
  scale?: number;
  /** Collapse all geometry onto z = 0. */
  flatten?: boolean;
  /** Default attributes for created airways. */
  defaults?: { area: number; perimeter: number; frictionFactor: number; type?: string };
  /** id prefixes (default N / A). */
  nodePrefix?: string;
  airwayPrefix?: string;
}

export interface ImportCounts {
  nodesCreated: number;
  airwaysCreated: number;
  /** Endpoints that merged onto an existing node within tolerance. */
  endpointsSnapped: number;
}

export interface CentrelineImportResult {
  network: VentNetwork;
  counts: ImportCounts;
}

const DEFAULT_ATTRS = { area: 12, perimeter: 14, frictionFactor: 0.012, type: 'imported' };

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Convert centrelines to a {@link VentNetwork}. DXF z (elevation, up-positive) is
 * mapped to the model's depth convention (z positive downward) by negation, unless
 * `flatten` is set. Plan x/y are passed through.
 */
export function centrelinesToNetwork(
  lines: Centreline[],
  options: CentrelineImportOptions = {},
): CentrelineImportResult {
  const tol = options.snapTolerance ?? 0.5;
  const mode = options.polylineMode ?? 'chain';
  const off = options.offset ?? { x: 0, y: 0, z: 0 };
  const scale = options.scale ?? 1;
  const flatten = options.flatten ?? false;
  const def = { ...DEFAULT_ATTRS, ...options.defaults };
  const nodePrefix = options.nodePrefix ?? 'N';
  const airwayPrefix = options.airwayPrefix ?? 'A';

  const nodes: Array<VentNode & { z: number }> = [];
  const airways: Airway[] = [];
  let snapped = 0;
  let nodeSeq = 0;
  let airwaySeq = 0;

  const transform = (p: Pt3) => ({
    x: p.x * scale + off.x,
    y: p.y * scale + off.y,
    z: flatten ? 0 : -((p.z ?? 0) * scale + off.z), // elevation (up) -> depth (down)
  });

  /** Return the id of an existing node within tolerance, or create a new one. */
  function nodeAt(p: Pt3): string {
    const t = transform(p);
    for (const n of nodes) {
      if (dist(n, t) <= tol) {
        snapped++;
        return n.id;
      }
    }
    const id = `${nodePrefix}${++nodeSeq}`;
    nodes.push({ id, label: id, x: t.x, y: t.y, z: t.z });
    return id;
  }

  const addAirway = (from: string, to: string, length: number) => {
    if (from === to || length <= 0) return; // skip degenerate (both ends snapped together)
    airways.push({
      id: `${airwayPrefix}${++airwaySeq}`,
      from,
      to,
      length,
      area: def.area,
      perimeter: def.perimeter,
      frictionFactor: def.frictionFactor,
      type: def.type,
    });
  };

  for (const line of lines) {
    const pts = line.points;
    if (pts.length < 2) continue;
    if (mode === 'single') {
      // One airway end-to-end; length = total path length along the polyline.
      let pathLen = 0;
      for (let i = 0; i < pts.length - 1; i++) pathLen += dist(transform(pts[i]), transform(pts[i + 1]));
      addAirway(nodeAt(pts[0]), nodeAt(pts[pts.length - 1]), pathLen);
    } else {
      // chain: one airway per segment; intermediate vertices become nodes.
      for (let i = 0; i < pts.length - 1; i++) {
        const len = dist(transform(pts[i]), transform(pts[i + 1]));
        addAirway(nodeAt(pts[i]), nodeAt(pts[i + 1]), len);
      }
    }
  }

  return {
    network: { nodes, airways },
    counts: { nodesCreated: nodes.length, airwaysCreated: airways.length, endpointsSnapped: snapped },
  };
}
