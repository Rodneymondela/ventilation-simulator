import DxfParser from 'dxf-parser';
import {
  centrelinesToNetwork,
  type Centreline,
  type CentrelineImportOptions,
  type CentrelineImportResult,
} from './centrelines';

/**
 * DXF parsing wrapper. Uses **dxf-parser** (npm `dxf-parser`, MIT) — a maintained
 * library — rather than a hand-rolled parser, per CLAUDE.md rule #6. It extracts
 * geometry only; the centreline -> network logic (snapping/connectivity) lives in
 * the pure, separately-tested ./centrelines module. DXF is the committed format;
 * DWG/DGN/Surpac/Datamine are not supported.
 */

export interface DxfLabel {
  layer: string;
  text: string;
  x: number;
  y: number;
}

export interface ParsedDxf {
  /** Distinct layers that carry geometry, sorted. */
  layers: string[];
  /** LINE / POLYLINE / LWPOLYLINE centrelines (candidate airways). */
  centrelines: Centreline[];
  /** SOLID / 3DFACE / wireframe outlines — reference geometry only, never airways. */
  reference: Centreline[];
  /** TEXT / MTEXT entities — optional labels. */
  labels: DxfLabel[];
}

const CENTRELINE_TYPES = new Set(['LINE', 'POLYLINE', 'LWPOLYLINE']);
const REFERENCE_TYPES = new Set(['3DFACE', 'SOLID', 'FACE']);

interface DxfVertex {
  x?: number;
  y?: number;
  z?: number;
}
interface DxfEntity {
  type?: string;
  layer?: string;
  vertices?: DxfVertex[];
  text?: string;
  startPoint?: DxfVertex;
  position?: DxfVertex;
}

function toPoints(vertices: DxfVertex[] | undefined): { x: number; y: number; z?: number }[] {
  return (vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0, z: v.z }));
}

/** Parse DXF text and bucket entities into centrelines, reference geometry and labels. */
export function parseDxf(text: string): ParsedDxf {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text) as { entities?: DxfEntity[] } | null;
  const entities = dxf?.entities ?? [];

  const centrelines: Centreline[] = [];
  const reference: Centreline[] = [];
  const labels: DxfLabel[] = [];
  const layers = new Set<string>();

  for (const e of entities) {
    const layer = e.layer ?? '0';
    const type = (e.type ?? '').toUpperCase();
    if (CENTRELINE_TYPES.has(type)) {
      const points = toPoints(e.vertices);
      if (points.length >= 2) {
        centrelines.push({ layer, points });
        layers.add(layer);
      }
    } else if (REFERENCE_TYPES.has(type)) {
      const points = toPoints(e.vertices);
      if (points.length >= 2) {
        reference.push({ layer, points });
        layers.add(layer);
      }
    } else if (type === 'TEXT' || type === 'MTEXT') {
      const p = e.startPoint ?? e.position;
      if (e.text != null && p) {
        labels.push({ layer, text: e.text, x: p.x ?? 0, y: p.y ?? 0 });
        layers.add(layer);
      }
    }
  }

  return { layers: [...layers].sort(), centrelines, reference, labels };
}

export interface DxfImportOptions extends CentrelineImportOptions {
  /** Only convert centrelines on these layers (undefined = all layers). */
  layers?: string[];
}

/**
 * Parse DXF text and build a network from the centrelines on the chosen layers.
 * Returns the parse result too, so the UI can show layer choices and reference
 * geometry. Callers decide whether to actually merge the network into the model
 * (default import should be reference-only — see CLAUDE.md rule #6).
 */
export function importDxf(
  text: string,
  options: DxfImportOptions = {},
): { parsed: ParsedDxf; conversion: CentrelineImportResult } {
  const parsed = parseDxf(text);
  const chosen = options.layers
    ? parsed.centrelines.filter((c) => options.layers!.includes(c.layer))
    : parsed.centrelines;
  const conversion = centrelinesToNetwork(chosen, options);
  return { parsed, conversion };
}
