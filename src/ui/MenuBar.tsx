import { useRef, useState } from 'react';
import { useNetworkStore } from '../store/networkStore';
import {
  download,
  exportModelJson,
  exportNetworkCsv,
  exportResultsCsv,
  parseModelJson,
} from '../io/modelIo';

interface MenuDef {
  label: string;
  items: { label: string; onClick: () => void; disabled?: boolean }[];
}

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const newModel = useNetworkStore((s) => s.newModel);
  const loadModel = useNetworkStore((s) => s.loadModel);
  const runSolve = useNetworkStore((s) => s.runSolve);
  const undo = useNetworkStore((s) => s.undo);
  const redo = useNetworkStore((s) => s.redo);

  const doSaveJson = () => {
    // Save the full pool + stage list so staging round-trips.
    const { network, stages } = useNetworkStore.getState();
    download('ventilation-model.json', exportModelJson(network, stages), 'application/json');
  };
  const doNetworkCsv = () => {
    // CSV reflects the active stage (what is currently shown).
    const net = useNetworkStore.getState().activeNetwork();
    download('ventilation-network.csv', exportNetworkCsv(net), 'text/csv');
  };
  const doResultsCsv = () => {
    const result = useNetworkStore.getState().result;
    if (!result) {
      alert('Run a solve first to export results.');
      return;
    }
    download('ventilation-results.csv', exportResultsCsv(result), 'text/csv');
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = parseModelJson(String(reader.result));
        loadModel(doc.network, doc.stages);
      } catch (err) {
        alert(`Could not open model: ${err instanceof Error ? err.message : err}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New model', onClick: () => newModel() },
        { label: 'Open model (JSON)…', onClick: () => fileInput.current?.click() },
        { label: 'Save model (JSON)', onClick: doSaveJson },
        { label: 'Export network (CSV)', onClick: doNetworkCsv },
        { label: 'Export results (CSV)', onClick: doResultsCsv },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', onClick: () => undo() },
        { label: 'Redo', onClick: () => redo() },
      ],
    },
    {
      label: 'Run',
      items: [{ label: 'Solve network', onClick: () => runSolve() }],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'About',
          onClick: () =>
            alert(
              'Mine Ventilation Network Simulator\n\n' +
                'Equation forms (Atkinson R=kOL/A³, square law p=RQ², Hardy Cross) are standard.\n' +
                'Friction factor k and air density are PLACEHOLDERS — verify against a primary ' +
                'source (e.g. McPherson, Subsurface Ventilation Engineering) before trusting results.',
            ),
        },
      ],
    },
  ];

  // View / Tools / Settings shown as disabled placeholders to mirror the reference layout.
  const placeholders = ['View', 'Tools', 'Settings'];

  return (
    <div
      className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1 text-sm"
      onMouseLeave={() => setOpen(null)}
    >
      <span className="px-2 font-semibold text-slate-800">⛏ VentSim</span>
      {menus.map((m) => (
        <div key={m.label} className="relative">
          <button
            type="button"
            className={`rounded px-2 py-1 hover:bg-slate-100 ${open === m.label ? 'bg-slate-100' : ''}`}
            onClick={() => setOpen(open === m.label ? null : m.label)}
          >
            {m.label}
          </button>
          {open === m.label && (
            <div className="absolute left-0 top-full z-20 w-56 rounded border border-slate-200 bg-white py-1 shadow-lg">
              {m.items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  disabled={it.disabled}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 disabled:opacity-40"
                  onClick={() => {
                    it.onClick();
                    setOpen(null);
                  }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {placeholders.map((p) => (
        <span key={p} className="px-2 py-1 text-slate-400" title="Not implemented yet">
          {p}
        </span>
      ))}
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
    </div>
  );
}
