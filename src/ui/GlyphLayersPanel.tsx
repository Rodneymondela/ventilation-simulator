import { useState } from 'react';
import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { GLYPH_DEFS } from '../display/glyphs';

/** Button + popover to toggle the airway/node status-glyph layers on the canvas. */
export function GlyphLayersPanel() {
  const [open, setOpen] = useState(false);
  const { glyphs, toggleGlyph } = useNetworkStore(
    useShallow((s) => ({ glyphs: s.glyphs, toggleGlyph: s.toggleGlyph })),
  );
  const hiddenCount = GLYPH_DEFS.filter((g) => !glyphs[g.kind]).length;

  return (
    <div className="relative">
      <button
        type="button"
        className={`rounded border border-slate-300 px-2 py-0.5 text-sm hover:bg-slate-100 ${
          open ? 'bg-slate-100' : ''
        }`}
        title="Toggle status glyphs"
        onClick={() => setOpen((o) => !o)}
      >
        ▦ Glyphs{hiddenCount > 0 ? ` (${GLYPH_DEFS.length - hiddenCount}/${GLYPH_DEFS.length})` : ''}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 space-y-1 rounded border border-slate-200 bg-white p-2 text-sm shadow-lg">
          {GLYPH_DEFS.map((g) => (
            <label
              key={g.kind}
              className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-50"
            >
              <input type="checkbox" checked={glyphs[g.kind]} onChange={() => toggleGlyph(g.kind)} />
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: g.color }}
              />
              <span className="text-slate-700">{g.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
