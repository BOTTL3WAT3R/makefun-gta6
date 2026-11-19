// job5-getaway.js — "Sirens": Pilar's cousin Marco has seen something he
// should not have, and the whole Comisaría knows his face. Pick him up at
// the clinic and reach the boardwalk safehouse — with the heat pinned at
// four stars the whole way.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';
import { setHeatFloor } from './police.js';

export default {
  id: 'sirens',
  title: 'Sirens',
  subtitle: 'Job 5 · A four-star getaway',
  payout: 320,
  intro: [
    ['Pilar', 'My cousin Marco talked to the wrong detective. He is hiding at Clínica Sol.'],
    ['Pilar', 'Pick him up — in a car, sobrino, this is not a walking errand.'],
    ['Pilar', 'The moment he sits down, every patrol in Costa Vera will know. Four stars, and they will not cool.'],
    ['Pilar', 'Get him to the safehouse at the south end of the boardwalk. Drive like the sea is chasing you.'],
  ],
  start(G) {
    G.job.active.data.stage = 0;
    setObjective(G, PLACES.clinicaDoor.x, PLACES.clinicaDoor.z, 'Pick up Marco at Clínica Sol (be in a car)');
  },
  update(G) {
    const data = G.job.active.data;
    if (data.stage === 0) {
      if (G.player.inVehicle && nearObjective(G, PLACES.clinicaDoor.x, PLACES.clinicaDoor.z, 9)) {
        data.stage = 1;
        setHeatFloor(G, 4);
        say(G, [
          ['Marco', 'That is them — that is them behind us! Drive!'],
          ['You', 'Sit down, cousin. And hold onto something.'],
        ]);
        setObjective(G, PLACES.safehouse.x, PLACES.safehouse.z, 'Reach the boardwalk safehouse — do not stop!');
      }
    } else if (data.stage === 1) {
      if (!G.player.inVehicle && !data.footWarned) {
        data.footWarned = true;
        say(G, [['Marco', 'You are walking?! Get a car — any car — before they box us in!']]);
      }
      if (nearObjective(G, PLACES.safehouse.x, PLACES.safehouse.z, 8)) {
        setHeatFloor(G, 0);
        return true;
      }
    }
    return false;
  },
};
