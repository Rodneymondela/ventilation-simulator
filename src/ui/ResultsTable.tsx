import { useNetworkStore } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';
import { FAN_STATE_STYLE } from '../display/fanStyle';

export function ResultsTable() {
  const { result, solveError, resultStale, contaminantConverged, setSelection, selection } =
    useNetworkStore(
      useShallow((s) => ({
        result: s.result,
        solveError: s.solveError,
        resultStale: s.resultStale,
        contaminantConverged: s.contaminantConverged,
        setSelection: s.setSelection,
        selection: s.selection,
      })),
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Results</span>
        {result ? (
          <span className={result.converged ? 'text-green-600' : 'text-red-600'}>
            {result.converged ? '● converged' : '● NOT converged'} · {result.iterations} iters · residual{' '}
            {result.residual.toExponential(2)} · {result.loopCount} mesh(es)
          </span>
        ) : (
          <span className="text-slate-400">no solve yet — press “Run solve”</span>
        )}
        {contaminantConverged === false && (
          <span className="text-amber-600">contaminant: no steady state (needs a sink/fresh node)</span>
        )}
        {contaminantConverged === true && <span className="text-emerald-600">contaminant solved</span>}
        {resultStale && result && <span className="text-amber-600">(network changed since solve)</span>}
        {solveError && <span className="text-red-600">error: {solveError}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-1 font-medium">Airway</th>
              <th className="px-3 py-1 text-right font-medium">R (Pa·s²/m⁶)</th>
              <th className="px-3 py-1 text-right font-medium">Q (m³/s)</th>
              <th className="px-3 py-1 text-right font-medium">Velocity (m/s)</th>
              <th className="px-3 py-1 text-right font-medium">Δp (Pa)</th>
              <th className="px-3 py-1 text-right font-medium">Fan (Pa)</th>
              <th className="px-3 py-1 text-left font-medium">Fan state</th>
              <th className="px-3 py-1 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {result?.airwayResults.map((r) => {
              const sel = selection?.type === 'airway' && selection.id === r.airwayId;
              return (
                <tr
                  key={r.airwayId}
                  onClick={() => setSelection({ type: 'airway', id: r.airwayId })}
                  className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                    sel ? 'bg-blue-50' : ''
                  } ${r.blocked ? 'text-slate-400' : ''}`}
                >
                  <td className="px-3 py-1">{r.airwayId}</td>
                  <td className="px-3 py-1 text-right font-mono">{r.R.toFixed(4)}</td>
                  <td className="px-3 py-1 text-right font-mono">{r.Q.toFixed(3)}</td>
                  <td className="px-3 py-1 text-right font-mono">{r.velocity.toFixed(3)}</td>
                  <td className="px-3 py-1 text-right font-mono">{r.pressureDrop.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right font-mono">
                    {r.fanState && r.fanState !== 'off' ? r.fanPressure.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-1">
                    {r.fanState ? (
                      <span className={`font-medium ${FAN_STATE_STYLE[r.fanState].text}`}>
                        ● {FAN_STATE_STYLE[r.fanState].label}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    {r.blocked && <span className="font-medium text-slate-500">⛔ blocked</span>}
                    {r.fixedFlow && (
                      <span className="font-medium text-violet-600">
                        ⇶ fixed
                        {r.fixedFlowPressure != null && (
                          <span className="ml-1 font-mono text-xs text-slate-500">
                            ({r.fixedFlowPressure >= 0 ? '+' : ''}
                            {r.fixedFlowPressure.toFixed(0)} Pa)
                          </span>
                        )}
                      </span>
                    )}
                    {!r.blocked && !r.fixedFlow && <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
            {!result && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-400">
                  Build a network and run a solve to see per-airway results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
