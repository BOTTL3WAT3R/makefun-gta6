// job3-chase.js — "Paper Trail": a courier with Pilar's ledger bolts across
// the plaza. Catch him on foot, take the ledger back to Pilar.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';
import { spawnChaseTarget } from './people.js';
import { playerPos } from './player.js';

export default {
  id: 'paper-trail',
  title: 'Paper Trail',
  subtitle: 'Job 3 · A courier who runs',
  payout: 180,
  intro: [
    ['Pilar', 'My courier, Tito, decided my ledger is worth more sold than carried.'],
    ['Pilar', 'He is by the plaza fountain, in the yellow shirt. Run him down. On foot — no cars, no guns.'],
    ['Pilar', 'Get the ledger. Tito himself you may keep, if you can carry him.'],
  ],
  start(G) {
    G.job.active.data.stage = 0;
    G.job.active.data.startedAt = G.elapsed;
    G.targetPed = spawnChaseTarget(G.scene, PLACES.plaza.x + 14, PLACES.plaza.z + 10);
    setObjective(G, G.targetPed.x, G.targetPed.z, 'Catch Tito the courier');
  },
  update(G) {
    const data = G.job.active.data;
    if (data.stage === 0) {
      const t = G.targetPed;
      if (!t) return 'fail';
      // Tito is fast, but he is not young: after a while his legs give out.
      if (!data.tired && G.elapsed - data.startedAt > 50) {
        data.tired = true;
        G.targetTired = true;
        say(G, [['Tito', 'Ay — my knee! My knee!']]);
      }
      setObjective(G, t.x, t.z, 'Catch Tito the courier');
      const pp = playerPos(G.player);
      if (!G.player.inVehicle && Math.hypot(pp.x - t.x, pp.z - t.z) < 2.6) {
        G.scene.remove(t.group);
        const i = G.peds.indexOf(t);
        if (i >= 0) G.peds.splice(i, 1);
        G.targetPed = null;
        data.stage = 1;
        say(G, [
          ['Tito', 'Ay! Take it! Take the ledger!'],
          ['You', 'Pilar sends her regards.'],
        ]);
        setObjective(G, PLACES.pilarCorner.x, PLACES.pilarCorner.z, 'Return the ledger to Pilar');
      }
    } else if (data.stage === 1) {
      if (nearObjective(G, PLACES.pilarCorner.x, PLACES.pilarCorner.z, 4.5)) return true;
    }
    return false;
  },
  cleanup(G) {
    G.targetTired = false;
    if (G.targetPed) {
      G.scene.remove(G.targetPed.group);
      G.targetPed = null;
    }
  },
};
