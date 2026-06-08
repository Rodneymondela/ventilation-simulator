/**
 * Airway/node status glyph layers (Ventsim-style indicators — our own simple
 * shapes, not Howden artwork). Each layer can be toggled on/off independently.
 */
export type GlyphKind =
  | 'fan'
  | 'regulator'
  | 'blocked'
  | 'fixedFlow'
  | 'fixedPressure'
  | 'contaminant';

export interface GlyphDef {
  kind: GlyphKind;
  label: string;
  /** A representative colour for the legend swatch. */
  color: string;
}

export const GLYPH_DEFS: GlyphDef[] = [
  { kind: 'fan', label: 'Fan', color: '#16a34a' },
  { kind: 'regulator', label: 'Regulator', color: '#b45309' },
  { kind: 'blocked', label: 'Blocked', color: '#dc2626' },
  { kind: 'fixedFlow', label: 'Fixed airflow', color: '#7c3aed' },
  { kind: 'fixedPressure', label: 'Fixed pressure', color: '#0284c7' },
  { kind: 'contaminant', label: 'Contaminant / report', color: '#059669' },
];

export const DEFAULT_GLYPHS: Record<GlyphKind, boolean> = {
  fan: true,
  regulator: true,
  blocked: true,
  fixedFlow: true,
  fixedPressure: true,
  contaminant: true,
};

/** Below this magnitude an airway's solved concentration is treated as "clean". */
export const CONTAMINANT_EPS = 1e-6;
