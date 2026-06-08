import { useEffect, lazy, Suspense } from 'react';
import { MenuBar } from './ui/MenuBar';
import { HeaderBar } from './ui/HeaderBar';
import { Toolbar } from './ui/Toolbar';
import { Canvas } from './ui/Canvas';
import { Legend } from './ui/Legend';

// Three.js is heavy — only load it when the 3D view is selected.
const View3D = lazy(() => import('./ui/View3D').then((m) => ({ default: m.View3D })));
import { PropertiesPanel } from './ui/PropertiesPanel';
import { ResultsTable } from './ui/ResultsTable';
import { useNetworkStore } from './store/networkStore';

function App() {
  const deleteSelected = useNetworkStore((s) => s.deleteSelected);
  const undo = useNetworkStore((s) => s.undo);
  const redo = useNetworkStore((s) => s.redo);
  const viewMode = useNetworkStore((s) => s.viewMode);

  // keyboard: Delete to remove selection, Ctrl+Z / Ctrl+Shift+Z for undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, undo, redo]);

  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-900">
      <MenuBar />
      <HeaderBar />
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {viewMode === '2d' ? (
            <Canvas />
          ) : (
            <Suspense fallback={<div className="grid h-full place-items-center text-slate-400">Loading 3D…</div>}>
              <View3D />
            </Suspense>
          )}
          <Legend />
        </div>
        <div className="w-80 shrink-0">
          <PropertiesPanel />
        </div>
      </div>
      <div className="h-56 shrink-0 border-t border-slate-300 bg-white">
        <ResultsTable />
      </div>
    </div>
  );
}

export default App;
