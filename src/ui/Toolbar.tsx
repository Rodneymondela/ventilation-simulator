import { useNetworkStore, type Tool } from '../store/networkStore';
import { useShallow } from 'zustand/react/shallow';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'select', label: '⬚ Select', title: 'Select / move (drag nodes, drag background to pan)' },
  { id: 'pan', label: '✋ Pan', title: 'Pan the view' },
  { id: 'addNode', label: '＋ Node', title: 'Add node: click empty canvas' },
  { id: 'addAirway', label: '／ Airway', title: 'Add airway: click two nodes' },
  { id: 'addFan', label: '🌀 Fan', title: 'Add fan: click an airway' },
  { id: 'addRegulator', label: '▥ Regulator', title: 'Add regulator: click an airway' },
];

function Btn({
  onClick,
  disabled,
  title,
  children,
  active,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded px-2.5 py-1 text-sm border transition-colors disabled:opacity-40 ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

export function Toolbar() {
  const { tool, setTool, runSolve, undo, redo, deleteSelected, past, future, selection, resultStale } =
    useNetworkStore(
      useShallow((s) => ({
        tool: s.tool,
        setTool: s.setTool,
        runSolve: s.runSolve,
        undo: s.undo,
        redo: s.redo,
        deleteSelected: s.deleteSelected,
        past: s.past,
        future: s.future,
        selection: s.selection,
        resultStale: s.resultStale,
      })),
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
      {TOOLS.map((t) => (
        <Btn key={t.id} onClick={() => setTool(t.id)} active={tool === t.id} title={t.title}>
          {t.label}
        </Btn>
      ))}
      <span className="mx-1 h-5 w-px bg-slate-300" />
      <Btn onClick={undo} disabled={past.length === 0} title="Undo">
        ↶ Undo
      </Btn>
      <Btn onClick={redo} disabled={future.length === 0} title="Redo">
        ↷ Redo
      </Btn>
      <Btn onClick={deleteSelected} disabled={!selection} title="Delete selected (also Del key)">
        🗑 Delete
      </Btn>
      <span className="mx-1 h-5 w-px bg-slate-300" />
      <Btn onClick={runSolve} title="Run steady-state solve" active>
        ▶ Run solve
      </Btn>
      {resultStale && <span className="text-xs text-amber-600">results out of date</span>}
    </div>
  );
}
