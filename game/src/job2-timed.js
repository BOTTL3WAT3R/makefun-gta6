// job2-timed.js — "Hot Lunch": a timed delivery. The Club Brisa kitchen
// sends tasting menus to a yacht at Marina Alba; the food, and the payout's
// tip, both go cold with every wasted second.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';

const TIME_LIMIT = 150;

export default {
  id: 'hot-lunch',
  title: 'Hot Lunch',
  subtitle: 'Job 2 · A delivery against the clock',
  payout: 150,
  intro: [
    ['Pilar', 'The Brisa kitchen feeds a yacht at Marina Alba. The chef is proud; the food travels badly.'],
    ['Pilar', 'Collect it from the kitchen door behind the club. Deliver it hot.'],
    ['Pilar', 'Every second left on the clock is a dollar in your pocket. Drive like the tide is coming.'],
  ],
  start(G) {
    G.job.active.data.stage = 0;
    setObjective(G, PLACES.clubRear.x, PLACES.clubRear.z, 'Collect the delivery behind Club Brisa');
  },
  update(G, dt) {
    const data = G.job.active.data;
    if (data.stage === 0) {
      if (nearObjective(G, PLACES.clubRear.x, PLACES.clubRear.z, 5)) {
        data.stage = 1;
        data.timeLeft = TIME_LIMIT;
        say(G, [['Chef', 'Go! Go! And if it arrives cold, I never met you!']]);
        setObjective(G, PLACES.marina.x, PLACES.marina.z, 'Deliver to Marina Alba — hot!');
      }
    } else if (data.stage === 1) {
      data.timeLeft -= dt;
      G.job.timer = data.timeLeft;
      if (!data.warned && data.timeLeft < 60) {
        data.warned = true;
        say(G, [['Chef (phone)', 'One minute! I can smell it cooling from here!']]);
      }
      if (data.timeLeft <= 0) {
        data.failReason = 'the food arrived cold.';
        return 'fail';
      }
      if (nearObjective(G, PLACES.marina.x, PLACES.marina.z, 7)) {
        data.bonus = Math.floor(data.timeLeft);
        G.job.timer = null;
        return true;
      }
    }
    return false;
  },
};
