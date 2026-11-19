// job1-pier.js — "First Light": a package waits at the end of the pier;
// carry it across town to Café Alba. The gentle first job.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';

export default {
  id: 'first-light',
  title: 'First Light',
  subtitle: 'Job 1 · A package on the pier',
  payout: 120,
  intro: [
    ['Pilar', 'You came. Good. I am Pilar Duarte — I fix things for people in Costa Vera.'],
    ['Pilar', 'A package came in on the morning boat. It waits at the end of the pier.'],
    ['Pilar', 'Bring it to Café Alba, west side. The owner owes me; now he owes you.'],
    ['You', 'Consider it done.'],
  ],
  start(G) {
    G.job.active.data.stage = 0;
    setObjective(G, PLACES.pierEnd.x, PLACES.pierEnd.z, 'Pick up the package at the pier end');
  },
  update(G) {
    const data = G.job.active.data;
    if (data.stage === 0) {
      if (nearObjective(G, PLACES.pierEnd.x, PLACES.pierEnd.z, 4.5)) {
        data.stage = 1;
        say(G, [['You', 'Got it. Heavy for its size. Best not to ask.']]);
        setObjective(G, PLACES.cafeAlba.x, PLACES.cafeAlba.z, 'Deliver the package to Café Alba');
      }
    } else if (data.stage === 1) {
      if (nearObjective(G, PLACES.cafeAlba.x, PLACES.cafeAlba.z, 5.5)) {
        say(G, [['Café owner', 'For Pilar? Then the debt is paid — and so are you, friend.']]);
        return true;
      }
    }
    return false;
  },
};
