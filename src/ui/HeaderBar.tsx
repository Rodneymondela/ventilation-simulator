import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { MAX_STAGES } from '../model/types';
import { SimSettingsPanel } from './SimSettingsPanel';
import { GlyphLayersPanel } from './GlyphLayersPanel';
import {
  DISPLAY_VARIABLES,
  DISPLAY_VARIABLE_LIST,
  type DisplaySetting,
  type DisplayVariableId,
} from '../display/variables';

function DisplaySelector({
  title,
  value,
  onChange,
}: {
  title: string;
  value: DisplaySetting;
  onChange: (d: DisplaySetting) => void;
}) {
  const def = DISPLAY_VARIABLES[value.variable];
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-slate-500">{title}</span>
      <select
        className="rounded border border-slate-300 bg-white px-1.5 py-0.5"
        value={value.variable}
        onChange={(e) => {
          const variable = e.target.value as DisplayVariableId;
          onChange({ variable, unitId: DISPLAY_VARIABLES[variable].units[0].id });
        }}
      >
        {DISPLAY_VARIABLE_LIST.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      <select
        className="rounded border border-slate-300 bg-white px-1.5 py-0.5"
        value={value.unitId}
        onChange={(e) => onChange({ ...value, unitId: e.target.value })}
      >
        {def.units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function HeaderBar() {
  const {
    stages,
    activeStageId,
    switchStage,
    addStage,
    duplicateStage,
    renameStage,
    deleteStage,
    display,
    setPrimaryDisplay,
    setSecondaryDisplay,
    viewMode,
    setViewMode,
  } = useNetworkStore(
    useShallow((s) => ({
      stages: s.stages,
      activeStageId: s.activeStageId,
      switchStage: s.switchStage,
      addStage: s.addStage,
      duplicateStage: s.duplicateStage,
      renameStage: s.renameStage,
      deleteStage: s.deleteStage,
      display: s.display,
      setPrimaryDisplay: s.setPrimaryDisplay,
      setSecondaryDisplay: s.setSecondaryDisplay,
      viewMode: s.viewMode,
      setViewMode: s.setViewMode,
    })),
  );

  const atMax = stages.length >= MAX_STAGES;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Stage</span>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-0.5"
          value={activeStageId}
          onChange={(e) => switchStage(e.target.value)}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
          title="New empty stage"
          disabled={atMax}
          onClick={addStage}
        >
          ＋
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
          title="Duplicate stage (airways become shared with the copy)"
          disabled={atMax}
          onClick={duplicateStage}
        >
          ⧉
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100"
          title="Rename current stage"
          onClick={() => {
            const name = prompt('Stage name', stages.find((s) => s.id === activeStageId)?.name);
            if (name) renameStage(activeStageId, name);
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 disabled:opacity-40"
          title="Delete current stage"
          disabled={stages.length <= 1}
          onClick={() => deleteStage(activeStageId)}
        >
          🗑
        </button>
        <span className="text-xs text-slate-400">{stages.length}/{MAX_STAGES}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <DisplaySelector title="Primary" value={display.primary} onChange={setPrimaryDisplay} />
        <DisplaySelector title="Secondary" value={display.secondary} onChange={setSecondaryDisplay} />
        <div className="flex overflow-hidden rounded border border-slate-300 text-sm">
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-0.5 ${
                viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <GlyphLayersPanel />
        <SimSettingsPanel />
      </div>
    </div>
  );
}
