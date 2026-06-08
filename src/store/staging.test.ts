import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore } from './networkStore';
import { stageView, inStage } from '../model/types';
import type { VentNetwork } from '../model/types';

const store = useNetworkStore;

/** A minimal 2-node, 1-airway model used as the test fixture. */
function fixture(): VentNetwork {
  return {
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0 },
      { id: 'N2', x: 1, y: 0, z: 0 },
    ],
    airways: [
      { id: 'A1', from: 'N1', to: 'N2', length: 1, area: 1, perimeter: 1, frictionFactor: 0.01 },
    ],
  };
}

describe('stage view helpers', () => {
  it('inStage: undefined/empty membership means all stages', () => {
    expect(inStage({}, 'sX')).toBe(true);
    expect(inStage({ stages: [] }, 'sX')).toBe(true);
    expect(inStage({ stages: ['sA'] }, 'sA')).toBe(true);
    expect(inStage({ stages: ['sA'] }, 'sB')).toBe(false);
  });

  it('stageView includes a node touched by a visible airway even if unassigned', () => {
    const pool: VentNetwork = {
      nodes: [
        { id: 'N1', x: 0, y: 0, z: 0, stages: ['sB'] }, // not in sA…
        { id: 'N2', x: 1, y: 0, z: 0, stages: ['sB'] },
      ],
      airways: [{ id: 'A1', from: 'N1', to: 'N2', length: 1, area: 1, perimeter: 1, frictionFactor: 0.01, stages: ['sA'] }],
    };
    const view = stageView(pool, 'sA');
    expect(view.airways.map((a) => a.id)).toEqual(['A1']);
    // …but both endpoints are pulled in so the airway is not dangling.
    expect(view.nodes.map((n) => n.id).sort()).toEqual(['N1', 'N2']);
  });
});

describe('staging — shared vs stage-unique airways (acceptance criterion 5)', () => {
  beforeEach(() => {
    store.getState().loadModel(fixture());
  });

  it('duplicateStage shares the airway, and editing it appears in BOTH stages', () => {
    store.getState().duplicateStage();
    const stages = store.getState().stages;
    expect(stages.length).toBe(2);
    const [base, copy] = stages;

    // The pooled airway now belongs to both stages.
    const a1 = store.getState().network.airways.find((a) => a.id === 'A1')!;
    expect(a1.stages).toEqual(expect.arrayContaining([base.id, copy.id]));

    // Edit the shared airway while viewing the Base stage.
    store.getState().switchStage(base.id);
    store.getState().updateAirway('A1', { length: 999 });

    const inBase = store.getState().activeNetwork().airways.find((a) => a.id === 'A1');
    expect(inBase?.length).toBe(999);

    // Switch to the copy — the edit propagated (single shared object).
    store.getState().switchStage(copy.id);
    const inCopy = store.getState().activeNetwork().airways.find((a) => a.id === 'A1');
    expect(inCopy?.length).toBe(999);
  });

  it('an airway added in one stage is NOT visible in another', () => {
    store.getState().duplicateStage();
    const [base, copy] = store.getState().stages;

    store.getState().switchStage(copy.id);
    store.getState().addAirway('N1', 'N2'); // stage-unique to `copy`
    const newId = store.getState().selection!.id;

    expect(store.getState().activeNetwork().airways.some((a) => a.id === newId)).toBe(true);

    store.getState().switchStage(base.id);
    expect(store.getState().activeNetwork().airways.some((a) => a.id === newId)).toBe(false);
  });

  it('deleting a shared airway from one stage keeps it in the other', () => {
    store.getState().duplicateStage();
    const [base, copy] = store.getState().stages;

    store.getState().switchStage(base.id);
    store.getState().setSelection({ type: 'airway', id: 'A1' });
    store.getState().deleteSelected();

    // Gone from Base…
    expect(store.getState().activeNetwork().airways.some((a) => a.id === 'A1')).toBe(false);
    // …still present in the copy.
    store.getState().switchStage(copy.id);
    expect(store.getState().activeNetwork().airways.some((a) => a.id === 'A1')).toBe(true);
  });

  it('switching stages does not auto-solve (results cleared, marked stale)', () => {
    store.getState().duplicateStage();
    store.getState().runSolve();
    expect(store.getState().result).not.toBeNull();

    const [base] = store.getState().stages;
    store.getState().switchStage(base.id);
    expect(store.getState().result).toBeNull();
    expect(store.getState().resultStale).toBe(true);
  });

  it('deleteStage refuses to drop the last stage and removes membership otherwise', () => {
    store.getState().duplicateStage();
    const before = store.getState().stages;
    expect(before.length).toBe(2);

    store.getState().deleteStage(before[1].id);
    expect(store.getState().stages.length).toBe(1);
    // A1 still present (it was shared); membership no longer references the removed stage.
    const a1 = store.getState().network.airways.find((a) => a.id === 'A1')!;
    expect(a1.stages).not.toContain(before[1].id);

    // Cannot delete the final remaining stage.
    store.getState().deleteStage(store.getState().stages[0].id);
    expect(store.getState().stages.length).toBe(1);
  });
});
