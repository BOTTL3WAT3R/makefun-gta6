// job7-finale.js — "La Última Marea": the last job. The Sombra crew's
// money is leaving Costa Vera by boat tonight. Meet Pilar at the pier,
// take the bag from under the crew's guns at Club Brisa, and reach the
// marina before the tide — and the law — close in.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';
import { spawnHostile } from './people.js';
import { setHeatFloor } from './police.js';

export default {
  id: 'la-ultima-marea',
  title: 'La Última Marea',
  subtitle: 'Job 7 · The last job',
  payout: 600,
  intro: [
    ['Pilar', 'One more, sobrino. The biggest. The Sombra money leaves by boat tonight, from Marina Alba.'],
    ['Pilar', 'Their cash bag waits at Club Brisa, and their best guns guard it. Then the boat is ours to meet.'],
    ['Pilar', 'Meet me at the end of the pier first. I want to look at the sea before we take it.'],
  ],
  start(G) {
    G.job.active.data.stage = 0;
    setObjective(G, PLACES.pierEnd.x, PLACES.pierEnd.z, 'Meet Pilar at the end of the pier');
  },
  update(G) {
    const data = G.job.active.data;
    if (data.stage === 0) {
      if (nearObjective(G, PLACES.pierEnd.x, PLACES.pierEnd.z, 5)) {
        data.stage = 1;
        say(G, [
          ['Pilar', 'My father fished these waters. He said the tide takes everything, in the end.'],
          ['Pilar', 'Tonight it takes the Sombras’ money. The bag is behind the club. Go and be the tide.'],
        ]);
        setObjective(G, PLACES.clubCarPark.x, PLACES.clubCarPark.z, 'Go to Club Brisa');
      }
    } else if (data.stage === 1) {
      if (nearObjective(G, PLACES.clubCarPark.x, PLACES.clubCarPark.z, 11)) {
        data.stage = 2;
        const spots = [
          { x: 206, z: -330 }, { x: 205, z: -300 }, { x: 178, z: -338 },
        ];
        for (const spot of spots) G.hostiles.push(spawnHostile(G.scene, spot.x, spot.z));
        say(G, [['Sombra captain', 'Nobody touches that bag and breathes!']]);
        setObjective(G, PLACES.clubRear.x, PLACES.clubRear.z, 'Grab the money bag behind the club');
      }
    } else if (data.stage === 2) {
      if (!G.player.inVehicle && nearObjective(G, PLACES.clubRear.x, PLACES.clubRear.z, 4)) {
        data.stage = 3;
        setHeatFloor(G, 3);
        say(G, [
          ['You', 'Got the bag. Half the city is about to want it back.'],
          ['Pilar (phone)', 'The boat waits at Marina Alba. Do not be late for the tide.'],
        ]);
        setObjective(G, PLACES.marina.x, PLACES.marina.z, 'Reach the boat at Marina Alba');
      }
    } else if (data.stage === 3) {
      if (nearObjective(G, PLACES.marina.x, PLACES.marina.z, 9)) {
        setHeatFloor(G, 0);
        return true;
      }
    }
    return false;
  },
  cleanup(G) {
    for (const h of G.hostiles) G.scene.remove(h.group);
    G.hostiles.length = 0;
  },
};
