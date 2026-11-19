// job6-theft.js — "Vendaval": a gold Vendaval GT sits in the marina car
// park with the keys in it and a very trusting owner. Take it to Pilar's
// lockup in the south-west — in that car, not in any other.

import { PLACES } from './config.js';
import { nearObjective, say, setObjective } from './jobs.js';
import { makeVehicle } from './vehicles.js';

export default {
  id: 'vendaval',
  title: 'Vendaval',
  subtitle: 'Job 6 · Steal the gold GT',
  payout: 380,
  intro: [
    ['Pilar', 'A gold Vendaval GT is parked at the marina. The owner is on his yacht, counting other people’s money.'],
    ['Pilar', 'The car is unlocked and the keys are in it. Some people insure things; some people donate them.'],
    ['Pilar', 'Bring it to my lockup, Almacén 9, south-west corner. That car, sobrino. Not a similar one.'],
  ],
  start(G) {
    const data = G.job.active.data;
    data.stage = 0;
    const car = makeVehicle('sports', 0xe8b93c, PLACES.marinaParking.x - 14, PLACES.marinaParking.z + 8, Math.PI, 'parked');
    car.hasDriver = false;
    G.scene.add(car.group);
    G.vehicles.push(car);
    data.carId = car.id;
    setObjective(G, car.x, car.z, 'Steal the gold Vendaval GT');
  },
  update(G) {
    const data = G.job.active.data;
    const car = G.vehicles.find((v) => v.id === data.carId);
    if (!car) return 'fail';
    if (data.stage === 0) {
      setObjective(G, car.x, car.z, 'Steal the gold Vendaval GT');
      if (G.player.inVehicle === car) {
        data.stage = 1;
        G.addWanted(2);
        say(G, [['You', 'Oh, she sings. The yacht man has taste, at least.']]);
        setObjective(G, PLACES.lockup.x, PLACES.lockup.z, 'Deliver the Vendaval to the lockup');
      }
    } else if (data.stage === 1) {
      if (G.player.inVehicle !== car) {
        setObjective(G, car.x, car.z, 'Get back in the gold Vendaval GT');
      } else {
        setObjective(G, PLACES.lockup.x, PLACES.lockup.z, 'Deliver the Vendaval to the lockup');
        if (nearObjective(G, PLACES.lockup.x, PLACES.lockup.z, 9)) {
          // The car is delivered: step out and hand it over.
          G.exitToFoot(PLACES.lockup.x + 8, PLACES.lockup.z - 6);
          G.scene.remove(car.group);
          G.vehicles.splice(G.vehicles.indexOf(car), 1);
          return true;
        }
      }
    }
    return false;
  },
  cleanup(G) {
    const data = G.job.active && G.job.active.data;
    if (data && data.carId) {
      const car = G.vehicles.find((v) => v.id === data.carId);
      if (car) {
        // If the job died while the player sits in the prize, step out first:
        // a retry must find the marina exactly as it was.
        if (G.player.inVehicle === car) G.exitToFoot(car.x + 4, car.z + 4);
        G.scene.remove(car.group);
        G.vehicles.splice(G.vehicles.indexOf(car), 1);
      }
    }
  },
};
