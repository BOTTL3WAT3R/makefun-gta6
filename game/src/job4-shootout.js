// job4-shootout.js — "Club Brisa": a rival crew has taken the club's car
// park the night of the big opening. Walk in, and be the only ones who
// walk out. Five hostiles, and the law will hear the shots.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';
import { spawnHostile } from './people.js';
import { setWanted } from './police.js';

const HOSTILE_SPOTS = [
  { x: 150, z: -262 }, { x: 186, z: -262 }, { x: 168, z: -284 },
  { x: 140, z: -280 }, { x: 196, z: -280 },
];

export default {
  id: 'club-brisa',
  title: 'Club Brisa',
  subtitle: 'Job 4 · Clear the car park',
  payout: 260,
  intro: [
    ['Pilar', 'The Sombra crew thinks Club Brisa changes owners tonight. Five of them, in the car park.'],
    ['Pilar', 'You have a pistol and my blessing. Clear the park before the opening.'],
    ['Pilar', 'And sobrino — the police will hear it. Two stars, maybe more. Be quick.'],
  ],
  start(G) {
    G.job.active.data.stage = 0;
    setObjective(G, PLACES.clubCarPark.x, PLACES.clubCarPark.z, 'Go to the Club Brisa car park');
  },
  update(G) {
    const data = G.job.active.data;
    if (data.stage === 0) {
      if (nearObjective(G, PLACES.clubCarPark.x, PLACES.clubCarPark.z, 11)) {
        data.stage = 1;
        for (const spot of HOSTILE_SPOTS) G.hostiles.push(spawnHostile(G.scene, spot.x, spot.z));
        setWanted(G, Math.max(G.police.wanted, 2));
        say(G, [['Sombra lookout', 'There! The one Pilar sent — light them up!']]);
        setObjective(G, PLACES.clubCarPark.x, PLACES.clubCarPark.z, 'Clear the car park (0/5)');
      }
    } else if (data.stage === 1) {
      const down = G.hostiles.filter((h) => h.mode === 'down').length;
      if (down >= 3 && !data.shouted) {
        data.shouted = true;
        say(G, [['Sombra lookout', 'Fall back! Fall— ay, there is no back!']]);
      }
      setObjective(G, PLACES.clubCarPark.x, PLACES.clubCarPark.z, 'Clear the car park (' + down + '/5)');
      if (G.hostiles.length > 0 && down >= G.hostiles.length) return true;
    }
    return false;
  },
  cleanup(G) {
    for (const h of G.hostiles) G.scene.remove(h.group);
    G.hostiles.length = 0;
  },
};
