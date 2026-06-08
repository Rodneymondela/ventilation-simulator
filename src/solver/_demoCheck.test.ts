import { it } from 'vitest';
import { createDemoNetwork } from '../model/demoNetwork';
import { solveNetwork, solveContaminant } from './index';
import { airwayResistance } from './resistance';

it('inspect demo solve', () => {
  const net = createDemoNetwork();
  const r = solveNetwork(net, { tolerance: 1e-9 });
  // eslint-disable-next-line no-console
  console.log('converged', r.converged, 'iters', r.iterations, 'loops', r.loopCount);
  for (const a of net.airways) {
    const res = r.airwayResults.find((x) => x.airwayId === a.id)!;
    // eslint-disable-next-line no-console
    console.log(
      `${a.id} ${a.from}->${a.to}  R=${airwayResistance(a).toFixed(3)}  Q=${res.Q.toFixed(4)}  v=${res.velocity.toFixed(3)}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log('node imbalance', r.nodeImbalance);
  const c = solveContaminant(net, r.flows);
  // eslint-disable-next-line no-console
  console.log('contaminant converged', c.converged, c.nodeConcentration);
});
