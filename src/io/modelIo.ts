import type { VentNetwork, Stage } from '../model/types';
import type { SolveResult } from '../solver';

/** Self-contained model document: the pooled network plus its stage list. */
export interface ModelDoc {
  network: VentNetwork;
  stages?: Stage[];
}

/** Trigger a browser download of `content` as `filename`. */
export function download(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Serialize the full pooled network plus its stage list. Each node/airway keeps
 * its `stages` membership, so staging round-trips through save/open.
 */
export function exportModelJson(network: VentNetwork, stages?: Stage[]): string {
  const doc = { nodes: network.nodes, airways: network.airways, stages: stages ?? [] };
  return JSON.stringify(doc, null, 2);
}

/** Parse and minimally validate a model JSON string. Throws on bad shape. */
export function parseModelJson(text: string): ModelDoc {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.airways)) {
    throw new Error('Not a valid model: expected { nodes: [], airways: [] }');
  }
  const stages = Array.isArray(data.stages) ? (data.stages as Stage[]) : undefined;
  return { network: { nodes: data.nodes, airways: data.airways }, stages };
}

function csvRow(values: (string | number)[]): string {
  return values
    .map((v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

/** Network geometry/properties as CSV. */
export function exportNetworkCsv(network: VentNetwork): string {
  const nodeRows = [
    csvRow(['#nodes']),
    csvRow(['id', 'label', 'x', 'y', 'z', 'fixedPressure_Pa']),
    ...network.nodes.map((n) =>
      csvRow([n.id, n.label ?? '', n.x, n.y, n.z, n.fixedPressure ?? '']),
    ),
  ];
  const airwayRows = [
    csvRow(['#airways']),
    csvRow([
      'id',
      'label',
      'from',
      'to',
      'length_m',
      'area_m2',
      'perimeter_m',
      'frictionFactor_k',
      'regulatorResistance',
      'hasFan',
      'type',
      'stages',
    ]),
    ...network.airways.map((a) =>
      csvRow([
        a.id,
        a.label ?? '',
        a.from,
        a.to,
        a.length,
        a.area,
        a.perimeter,
        a.frictionFactor,
        a.regulatorResistance ?? '',
        a.fan ? 'yes' : 'no',
        a.type ?? '',
        (a.stages ?? []).join(' '),
      ]),
    ),
  ];
  return [...nodeRows, '', ...airwayRows].join('\n');
}

/** Solve results per airway as CSV. */
export function exportResultsCsv(result: SolveResult): string {
  const rows = [
    csvRow([
      'airwayId',
      'resistance_Pa_s2_m6',
      'flow_m3_s',
      'velocity_m_s',
      'pressureDrop_Pa',
      'fanPressure_Pa',
    ]),
    ...result.airwayResults.map((r) =>
      csvRow([r.airwayId, r.R, r.Q, r.velocity, r.pressureDrop, r.fanPressure]),
    ),
  ];
  return rows.join('\n');
}
