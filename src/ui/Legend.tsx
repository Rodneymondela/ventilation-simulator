import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { computeRange } from '../display/mapping';
import { legendGradientCss } from '../display/colorScale';
import { DISPLAY_VARIABLES, getUnit } from '../display/variables';

export function Legend() {
  const { result, display } = useNetworkStore(
    useShallow((s) => ({ result: s.result, display: s.display })),
  );
  if (!result) return null;

  const def = DISPLAY_VARIABLES[display.primary.variable];
  const unit = getUnit(display.primary.variable, display.primary.unitId);
  const range = computeRange(result.airwayResults, display.primary.variable);
  const min = range.min * unit.factor;
  const max = range.max * unit.factor;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-slate-200 bg-white/90 p-2 text-xs shadow">
      <div className="mb-1 font-medium text-slate-700">
        {def.label} ({unit.label})
      </div>
      <div className="h-3 w-44 rounded" style={{ background: legendGradientCss() }} />
      <div className="mt-0.5 flex w-44 justify-between text-slate-600">
        <span>{min.toFixed(unit.decimals)}</span>
        <span>{max.toFixed(unit.decimals)}</span>
      </div>
    </div>
  );
}
