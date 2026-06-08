import { useState } from 'react';
import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import type { SimSettings } from '../model/types';

function NumberRow({
  label,
  value,
  onChange,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step={step ?? 'any'}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-28 rounded border border-slate-300 px-1.5 py-0.5 text-right"
        />
        {suffix && <span className="w-16 text-xs text-slate-400">{suffix}</span>}
      </span>
    </label>
  );
}

/** Gear button + popover for whole-model simulation settings (Ventsim "accuracy"/air properties). */
export function SimSettingsPanel() {
  const [open, setOpen] = useState(false);
  const { simSettings, setSimSettings } = useNetworkStore(
    useShallow((s) => ({ simSettings: s.simSettings, setSimSettings: s.setSimSettings })),
  );
  const set = (patch: Partial<SimSettings>) => setSimSettings(patch);

  return (
    <div className="relative">
      <button
        type="button"
        className={`rounded border border-slate-300 px-2 py-0.5 text-sm hover:bg-slate-100 ${
          open ? 'bg-slate-100' : ''
        }`}
        title="Simulation settings"
        onClick={() => setOpen((o) => !o)}
      >
        ⚙ Settings
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 space-y-2 rounded border border-slate-200 bg-white p-3 text-sm shadow-lg">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Air density
          </div>
          <NumberRow
            label="Reference density ρ_ref"
            value={simSettings.referenceDensity}
            step={0.01}
            onChange={(v) => set({ referenceDensity: v })}
            suffix="kg/m³ *"
          />
          <NumberRow
            label="Operating density ρ"
            value={simSettings.airDensity}
            step={0.01}
            onChange={(v) => set({ airDensity: v })}
            suffix="kg/m³"
          />
          <label className="flex items-center justify-between gap-2">
            <span className="text-slate-600">Natural ventilation pressure</span>
            <input
              type="checkbox"
              checked={simSettings.naturalVentilation}
              onChange={(e) => set({ naturalVentilation: e.target.checked })}
            />
          </label>
          {simSettings.naturalVentilation && (
            <NumberRow
              label="Gravity g"
              value={simSettings.gravity}
              step={0.01}
              onChange={(v) => set({ gravity: v })}
              suffix="m/s²"
            />
          )}

          <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Convergence
          </div>
          <NumberRow
            label="Flow tolerance"
            value={simSettings.tolerance}
            step={1e-7}
            onChange={(v) => set({ tolerance: v })}
            suffix="m³/s"
          />
          <NumberRow
            label="Max iterations"
            value={simSettings.maxIterations}
            step={50}
            onChange={(v) => set({ maxIterations: Math.max(1, Math.round(v)) })}
          />

          <p className="text-[11px] text-amber-600">
            * Density defaults follow the Ventsim 1.2 kg/m³ convention — verify against a primary
            source. NVP only drives flow when intake/return air densities differ.
          </p>
        </div>
      )}
    </div>
  );
}
