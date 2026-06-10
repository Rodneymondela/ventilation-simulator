import { useMemo, useRef, useState } from 'react';
import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { parseDxf, importDxf, type ParsedDxf } from '../dxf/importDxf';
import { centrelinesToNetwork } from '../dxf/centrelines';
import type { ReferenceLine } from '../model/types';

type Mode = 'reference' | 'airways';
type Target = 'merge' | 'replace';

/**
 * DXF import: button + modal. Defaults to REFERENCE-ONLY so an import cannot
 * silently corrupt the network (CLAUDE.md rule #6); converting to airways is an
 * explicit choice. Shows layer selection and a live count preview before applying.
 */
export function DxfImportPanel() {
  const { applyDxfReference, applyDxfAirways, referenceLines, clearReferenceLines } = useNetworkStore(
    useShallow((s) => ({
      applyDxfReference: s.applyDxfReference,
      applyDxfAirways: s.applyDxfAirways,
      referenceLines: s.referenceLines,
      clearReferenceLines: s.clearReferenceLines,
    })),
  );

  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedDxf | null>(null);
  const [layers, setLayers] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('reference');
  const [target, setTarget] = useState<Target>('merge');
  const [snapTolerance, setSnap] = useState(0.5);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0, z: 0 });
  const [flatten, setFlatten] = useState(false);
  const [single, setSingle] = useState(false);

  const opts = useMemo(
    () => ({
      layers: [...layers],
      snapTolerance,
      scale,
      offset,
      flatten,
      polylineMode: single ? ('single' as const) : ('chain' as const),
    }),
    [layers, snapTolerance, scale, offset, flatten, single],
  );

  // Live preview of what the chosen options would produce.
  const preview = useMemo(() => {
    if (!text) return null;
    try {
      return importDxf(text, opts).conversion.counts;
    } catch {
      return null;
    }
  }, [text, opts]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const t = String(reader.result);
        const p = parseDxf(t);
        setText(t);
        setParsed(p);
        setLayers(new Set(p.layers));
      } catch (err) {
        alert(`Could not read DXF: ${err instanceof Error ? err.message : err}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const close = () => {
    setText(null);
    setParsed(null);
  };

  const apply = () => {
    if (!text) return;
    const chosen = parseDxf(text).centrelines.filter((c) => layers.has(c.layer));
    if (mode === 'airways') {
      const { network } = centrelinesToNetwork(chosen, opts);
      applyDxfAirways(network, target);
    } else {
      // Reference-only: store transformed plan polylines for faint display.
      const lines: ReferenceLine[] = chosen.map((c) => ({
        layer: c.layer,
        points: c.points.map((p) => ({ x: p.x * scale + offset.x, y: p.y * scale + offset.y })),
      }));
      applyDxfReference(lines, target);
    }
    close();
  };

  const toggleLayer = (layer: string) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-0.5 text-sm hover:bg-slate-100"
        title="Import a DXF of mine centrelines"
        onClick={() => fileInput.current?.click()}
      >
        ⬇ DXF
      </button>
      {referenceLines.length > 0 && (
        <button
          type="button"
          className="ml-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
          title="Clear imported reference geometry"
          onClick={() => clearReferenceLines()}
        >
          Clear ref ({referenceLines.length})
        </button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={onFile}
      />

      {parsed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[30rem] max-h-[85vh] overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-slate-800">Import DXF</h2>

            {parsed.layers.length === 0 ? (
              <p className="text-amber-600">No importable geometry (LINE / POLYLINE) found in this file.</p>
            ) : (
              <>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Layers ({parsed.centrelines.length} centrelines, {parsed.reference.length} reference,{' '}
                  {parsed.labels.length} labels)
                </div>
                <div className="mb-3 max-h-32 space-y-0.5 overflow-auto rounded border border-slate-200 p-1.5">
                  {parsed.layers.map((l) => (
                    <label key={l} className="flex items-center gap-2 px-1">
                      <input type="checkbox" checked={layers.has(l)} onChange={() => toggleLayer(l)} />
                      <span className="text-slate-700">{l}</span>
                    </label>
                  ))}
                </div>

                <div className="mb-2 flex gap-4">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={mode === 'reference'} onChange={() => setMode('reference')} />
                    Reference only
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={mode === 'airways'} onChange={() => setMode('airways')} />
                    Airways
                  </label>
                </div>
                <div className="mb-2 flex gap-4">
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={target === 'merge'} onChange={() => setTarget('merge')} />
                    Merge
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" checked={target === 'replace'} onChange={() => setTarget('replace')} />
                    Replace
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Num label="Snap tol" value={snapTolerance} onChange={setSnap} />
                  <Num label="Scale" value={scale} onChange={setScale} />
                  <Num label="Offset X" value={offset.x} onChange={(v) => setOffset({ ...offset, x: v })} />
                  <Num label="Offset Y" value={offset.y} onChange={(v) => setOffset({ ...offset, y: v })} />
                </div>
                <div className="mt-2 flex gap-4">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
                    Flatten to 2D
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} />
                    Polyline = single airway
                  </label>
                </div>

                <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600">
                  {mode === 'airways' && preview ? (
                    <>
                      Would create <b>{preview.nodesCreated}</b> nodes, <b>{preview.airwaysCreated}</b> airways,
                      snapping <b>{preview.endpointsSnapped}</b> endpoints.
                    </>
                  ) : (
                    <>
                      Reference-only: draws the selected centrelines as faint guide lines (no airways
                      created). Convert later, or pick “Airways”.
                    </>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={parsed.layers.length === 0 || layers.size === 0}
                className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-40"
                onClick={apply}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-1">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-right"
      />
    </label>
  );
}
