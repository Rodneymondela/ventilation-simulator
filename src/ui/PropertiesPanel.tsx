import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { airwayResistance } from '../solver';
import { FAN_STATE_STYLE } from '../display/fanStyle';
import type { Airway, Fan, VentNode } from '../model/types';

function Field({
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
          className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-right"
        />
        {suffix && <span className="w-16 text-xs text-slate-400">{suffix}</span>}
      </span>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded border border-slate-300 px-1.5 py-0.5"
      />
    </label>
  );
}

function NodeEditor({ node }: { node: VentNode }) {
  const updateNode = useNetworkStore((s) => s.updateNode);
  const fixed = node.fixedPressure != null;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-slate-800">Node {node.id}</h3>
      <TextField label="Label" value={node.label ?? ''} onChange={(v) => updateNode(node.id, { label: v })} />
      <Field label="x" value={node.x} onChange={(v) => updateNode(node.id, { x: v })} />
      <Field label="y" value={node.y} onChange={(v) => updateNode(node.id, { y: v })} />
      <Field label="z (depth)" value={node.z} onChange={(v) => updateNode(node.id, { z: v })} suffix="m" />
      <label className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">Fixed pressure (surface)</span>
        <input
          type="checkbox"
          checked={fixed}
          onChange={(e) => updateNode(node.id, { fixedPressure: e.target.checked ? 0 : null })}
        />
      </label>
      {fixed && (
        <Field
          label="Pressure"
          value={node.fixedPressure ?? 0}
          onChange={(v) => updateNode(node.id, { fixedPressure: v })}
          suffix="Pa"
        />
      )}

      <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/50 p-2">
        <div className="mb-1 text-sm font-medium text-emerald-700">Contaminant (approx.)</div>
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">Hold fixed concentration</span>
          <input
            type="checkbox"
            checked={node.contaminantConcentration != null}
            onChange={(e) =>
              updateNode(node.id, { contaminantConcentration: e.target.checked ? 0 : null })
            }
          />
        </label>
        {node.contaminantConcentration != null && (
          <Field
            label="Concentration"
            value={node.contaminantConcentration}
            onChange={(v) => updateNode(node.id, { contaminantConcentration: v })}
            suffix="units"
          />
        )}
        <Field
          label="Injection rate"
          value={node.contaminantInjection ?? 0}
          onChange={(v) => updateNode(node.id, { contaminantInjection: v || null })}
          suffix="units·m³/s"
        />
        <p className="mt-1 text-[11px] text-amber-600">
          Flow-weighted mixing, conservative tracer. Not a validated exposure model.
        </p>
      </div>
    </div>
  );
}

function FanEditor({ airway }: { airway: Airway }) {
  const setFan = useNetworkStore((s) => s.setFan);
  const fan = airway.fan!;
  const update = (patch: Partial<Fan>) => setFan(airway.id, { ...fan, ...patch });
  const setPoint = (i: number, key: 'q' | 'p', v: number) => {
    const curve = fan.curve.map((pt, idx) => (idx === i ? { ...pt, [key]: v } : pt));
    update({ curve });
  };
  return (
    <div className="mt-2 rounded border border-blue-200 bg-blue-50/50 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-blue-700">Fan curve (Q, P)</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={fan.off ?? false}
              onChange={(e) => update({ off: e.target.checked })}
            />
            off
          </label>
          <button
            type="button"
            className="text-xs text-red-600 hover:underline"
            onClick={() => setFan(airway.id, null)}
          >
            remove fan
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {fan.curve.map((pt, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <input
              type="number"
              value={pt.q}
              onChange={(e) => setPoint(i, 'q', parseFloat(e.target.value))}
              className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right"
            />
            <span className="text-slate-400">m³/s →</span>
            <input
              type="number"
              value={pt.p}
              onChange={(e) => setPoint(i, 'p', parseFloat(e.target.value))}
              className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right"
            />
            <span className="text-slate-400">Pa</span>
            <button
              type="button"
              className="ml-auto text-slate-400 hover:text-red-600"
              onClick={() => update({ curve: fan.curve.filter((_, idx) => idx !== i) })}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-1 text-xs text-blue-600 hover:underline"
        onClick={() => {
          const last = fan.curve[fan.curve.length - 1] ?? { q: 0, p: 0 };
          update({ curve: [...fan.curve, { q: last.q + 50, p: Math.max(0, last.p - 500) }] });
        }}
      >
        + add point
      </button>
    </div>
  );
}

function StagesEditor({ airway }: { airway: Airway }) {
  const { stages, setAirwayStages } = useNetworkStore(
    useShallow((s) => ({ stages: s.stages, setAirwayStages: s.setAirwayStages })),
  );
  if (stages.length <= 1) return null;
  const allIds = stages.map((s) => s.id);
  // Ubiquitous (undefined/empty) membership shows as "in every stage".
  const member = new Set(airway.stages && airway.stages.length > 0 ? airway.stages : allIds);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(member);
    if (on) next.add(id);
    else next.delete(id);
    if (next.size === 0) return; // an airway must belong to at least one stage
    setAirwayStages(airway.id, allIds.filter((sid) => next.has(sid)));
  };

  return (
    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
      <div className="mb-1 text-sm font-medium text-slate-600">
        Stages <span className="text-xs text-slate-400">(shared across {member.size})</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {stages.map((s) => (
          <label key={s.id} className="flex items-center gap-1 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={member.has(s.id)}
              onChange={(e) => toggle(s.id, e.target.checked)}
            />
            {s.name}
          </label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        An airway in multiple stages is shared — edits here apply in all of them.
      </p>
    </div>
  );
}

function AirwayEditor({ airway }: { airway: Airway }) {
  const { updateAirway, setFan, result } = useNetworkStore(
    useShallow((s) => ({ updateAirway: s.updateAirway, setFan: s.setFan, result: s.result })),
  );
  const R = airwayResistance(airway);
  const res = result?.airwayResults.find((r) => r.airwayId === airway.id);

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-slate-800">
        Airway {airway.id} <span className="text-slate-400">({airway.from} → {airway.to})</span>
      </h3>
      <TextField label="Label" value={airway.label ?? ''} onChange={(v) => updateAirway(airway.id, { label: v })} />
      <TextField label="Type" value={airway.type ?? ''} onChange={(v) => updateAirway(airway.id, { type: v })} />
      <Field label="Length L" value={airway.length} onChange={(v) => updateAirway(airway.id, { length: v })} suffix="m" />
      <Field label="Area A" value={airway.area} onChange={(v) => updateAirway(airway.id, { area: v })} suffix="m²" />
      <Field label="Perimeter O" value={airway.perimeter} onChange={(v) => updateAirway(airway.id, { perimeter: v })} suffix="m" />
      <Field
        label="Friction k"
        value={airway.frictionFactor}
        onChange={(v) => updateAirway(airway.id, { frictionFactor: v })}
        suffix="kg/m³ *"
      />
      <Field
        label="Regulator R"
        value={airway.regulatorResistance ?? 0}
        onChange={(v) => updateAirway(airway.id, { regulatorResistance: v })}
        suffix="Pa·s²/m⁶"
      />
      <Field
        label="Flow exponent n"
        value={airway.flowExponent ?? 2}
        step={0.1}
        onChange={(v) => updateAirway(airway.id, { flowExponent: v })}
        suffix="2=turb · 1=lam"
      />
      <p className="text-[11px] text-amber-600">* k is a placeholder — verify against a primary source.</p>
      <p className="text-[11px] text-slate-400">
        n is the Atkinson exponent in p = R·Qⁿ (clamped 1–2): 2 = turbulent, ~1 = laminar.
      </p>

      <div className="mt-1 space-y-1 border-t border-slate-100 pt-2">
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">Override air density</span>
          <input
            type="checkbox"
            checked={airway.airDensity != null}
            onChange={(e) =>
              updateAirway(airway.id, { airDensity: e.target.checked ? 1.2 : undefined })
            }
          />
        </label>
        {airway.airDensity != null && (
          <Field
            label="Air density ρ"
            value={airway.airDensity}
            step={0.01}
            onChange={(v) => updateAirway(airway.id, { airDensity: v })}
            suffix="kg/m³"
          />
        )}
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-600">Already density-adjusted</span>
          <input
            type="checkbox"
            checked={airway.densityAdjusted ?? false}
            onChange={(e) => updateAirway(airway.id, { densityAdjusted: e.target.checked || undefined })}
          />
        </label>
        <p className="text-[11px] text-slate-400">
          R is scaled by ρ/ρ_ref unless already-adjusted. ρ also sets this airway's NVP column.
        </p>
      </div>

      <div className="rounded bg-slate-50 p-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Resistance R</span>
          <span className="font-mono">{R.toFixed(4)} Pa·s²/m⁶</span>
        </div>
        {res && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-500">Flow Q</span>
              <span className="font-mono">{res.Q.toFixed(3)} m³/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Velocity</span>
              <span className="font-mono">{res.velocity.toFixed(3)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pressure drop</span>
              <span className="font-mono">{res.pressureDrop.toFixed(2)} Pa</span>
            </div>
            {res.fanState && res.fanState !== 'off' && (
              <div className="flex justify-between">
                <span className="text-slate-500">Fan pressure</span>
                <span className="font-mono">{res.fanPressure.toFixed(2)} Pa</span>
              </div>
            )}
            {res.fanState && (
              <div className="flex justify-between">
                <span className="text-slate-500">Fan state</span>
                <span className={`font-medium ${FAN_STATE_STYLE[res.fanState].text}`}>
                  {FAN_STATE_STYLE[res.fanState].label}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {airway.fan ? (
        <FanEditor airway={airway} />
      ) : (
        <button
          type="button"
          className="text-sm text-blue-600 hover:underline"
          onClick={() =>
            setFan(airway.id, {
              id: `fan_${airway.id}`,
              name: `Fan ${airway.id}`,
              curve: [
                { q: 0, p: 2000 },
                { q: 100, p: 1500 },
                { q: 200, p: 0 },
              ],
            })
          }
        >
          + add fan to this airway
        </button>
      )}

      <StagesEditor airway={airway} />
    </div>
  );
}

export function PropertiesPanel() {
  const { selection, network } = useNetworkStore(
    useShallow((s) => ({ selection: s.selection, network: s.activeNetwork() })),
  );

  let content: React.ReactNode = (
    <p className="text-sm text-slate-400">Select a node or airway to edit its properties.</p>
  );
  if (selection?.type === 'node') {
    const node = network.nodes.find((n) => n.id === selection.id);
    if (node) content = <NodeEditor node={node} />;
  } else if (selection?.type === 'airway') {
    const airway = network.airways.find((a) => a.id === selection.id);
    if (airway) content = <AirwayEditor airway={airway} />;
  }

  return (
    <div className="h-full overflow-y-auto border-l border-slate-200 bg-white p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Properties</h2>
      {content}
    </div>
  );
}
