// missions.js — the story and the street life of Costa Vera.
// Pilar Duarte, a fixer who holds court by the fountain, gives seven jobs
// that tell one story: a debt, a tide of contraband, and a last boat out.
// Around the story sit the city's activities: two gate races (the Gran
// Vuelta and the Boardwalk Run), taxi duty, and fifteen hidden packages.

import * as THREE from 'three';
import { clamp, dist2d, makeRng } from './util.js';
import { LOCATIONS } from './world.js';
import { makePersonMesh, animateWalk, Pedestrian } from './people.js';

const rng = makeRng(60606);

const JOBS = [
  {
    title: 'La Primera Entrega',
    pay: 150,
    intro: [
      ['Pilar Duarte', 'You walk like someone who needs money, cariño. I am Pilar. I move things in this city — quietly.'],
      ['Pilar Duarte', 'Simple work first. A parcel by the plaza stalls. Take it to Café Brisa on the boardwalk. Do not open it.'],
    ],
    steps: [
      { kind: 'goto', x: -14, z: 18, r: 3.4, text: 'Pick up the parcel at the plaza stalls' },
      { kind: 'goto', x: LOCATIONS.pierCafe.x, z: LOCATIONS.pierCafe.z, r: 5, text: 'Deliver the parcel to Café Brisa' },
    ],
    outro: [['Pilar Duarte', 'Clean and quick. The city notices people like you. So do I. Come back.']],
  },
  {
    title: 'Lo Que Trae la Marea',
    pay: 220,
    intro: [
      ['Pilar Duarte', 'The tide brought a cooler to the end of the pier. It is heavy, it is cold, and it is not fish.'],
      ['Pilar Duarte', 'Bring it to the Club Brisa car park. If the police look at you — smile, and keep driving.'],
    ],
    steps: [
      { kind: 'goto', x: LOCATIONS.pierEnd.x, z: LOCATIONS.pierEnd.z, r: 5, text: 'Pick up the cooler at the pier end', crime: 1 },
      { kind: 'goto', x: LOCATIONS.clubCarPark.x, z: LOCATIONS.clubCarPark.z, r: 7, text: 'Deliver the cooler to the Club Brisa car park' },
    ],
    outro: [['Pilar Duarte', 'Silvio sends his thanks, which from him is practically a love letter.']],
  },
  {
    title: 'La Deuda de Tomás',
    pay: 260,
    intro: [
      ['Pilar Duarte', 'Tomás Rey owes me for three months of "tomorrow". He is at the Mercado, spending money that is mine.'],
      ['Pilar Duarte', 'Have a word with him. He runs fast, but everyone in Costa Vera runs toward the sea eventually.'],
    ],
    steps: [
      { kind: 'goto', x: LOCATIONS.marketDoor.x, z: LOCATIONS.marketDoor.z, r: 5, text: 'Find Tomás at the Mercado Brisa' },
      { kind: 'chase', text: 'Catch Tomás — do not let him reach the beach' },
    ],
    outro: [['Pilar Duarte', 'He paid in full, plus interest, plus a story about your legs. Well earned.']],
  },
  {
    title: 'Pasajera Ilustre',
    pay: 340,
    intro: [
      ['Pilar Duarte', 'Lucía Ferrer sings at Club Brisa and half the city is in love with her. Tonight, the wrong half.'],
      ['Pilar Duarte', 'She is hiding at the Clínica. Pick her up and take her to the pier. Fast, smooth, alive — all three.'],
    ],
    steps: [
      { kind: 'goto', x: LOCATIONS.clinicDoor.x, z: LOCATIONS.clinicDoor.z, r: 6, text: 'Pick up Lucía at the Clínica del Sol', passenger: 'Lucía Ferrer' },
      { kind: 'goto', x: LOCATIONS.pierEnd.x, z: LOCATIONS.pierEnd.z, r: 6, text: 'Drive Lucía to the pier end', timer: 170, crime: 2 },
    ],
    outro: [['Lucía Ferrer', 'You drive like the city owes you money. Gracias, guapo. Tell Pilar the boat was beautiful.']],
  },
  {
    title: 'Cuentas Claras',
    pay: 420,
    intro: [
      ['Pilar Duarte', 'The Vidal brothers decided Club Brisa changes owners tonight. Silvio disagrees. So do I.'],
      ['Pilar Duarte', 'Clear the car park. All of them. Then knock on the club door so Silvio knows he still has a club.'],
    ],
    steps: [
      { kind: 'goto', x: LOCATIONS.clubCarPark.x, z: LOCATIONS.clubCarPark.z, r: 9, text: 'Go to the Club Brisa car park' },
      { kind: 'clear', x: LOCATIONS.clubCarPark.x, z: LOCATIONS.clubCarPark.z, text: 'Clear the car park of the Vidal brothers' },
      { kind: 'goto', x: LOCATIONS.clubDoor.x, z: LOCATIONS.clubDoor.z, r: 4.5, text: 'Report to Silvio at the club door' },
    ],
    outro: [['Silvio', 'The club stands because of you. Pilar, this one is gold. GOLD. Drinks are on the house forever.']],
  },
  {
    title: 'La Vuelta Sucia',
    pay: 450,
    intro: [
      ['Pilar Duarte', 'A courier with a loud mouth says no one can cross Costa Vera faster than him. Prove the city wrong.'],
      ['Pilar Duarte', 'Four corners of my city, against the clock. The police will love the show. Try not to give them an encore.'],
    ],
    steps: [
      { kind: 'drive', x: -165, z: -165, r: 10, text: 'Checkpoint 1: the north-west corner', timer: 120, crime: 1 },
      { kind: 'drive', x: 165, z: -165, r: 10, text: 'Checkpoint 2: the north-east corner' },
      { kind: 'drive', x: 165, z: 165, r: 10, text: 'Checkpoint 3: the south-east corner' },
      { kind: 'drive', x: 0, z: 0, r: 12, text: 'Finish at the Plaza del Faro' },
    ],
    outro: [['Pilar Duarte', 'The loud mouth paid double and left quietly. The city has a new story tonight.']],
  },
  {
    title: 'La Última Marea',
    pay: 1000,
    intro: [
      ['Pilar Duarte', 'Listen well, because this is the last job, and it is mine. Everything I moved for years leaves tonight, on one boat.'],
      ['Pilar Duarte', 'Silvio holds the harbour papers at the club. Get them. Then the pier — and the whole police force will try to stop you.'],
      ['Pilar Duarte', 'Four stars will not leave you until the boat does. Drive like the tide, cariño: nothing stops the tide.'],
    ],
    steps: [
      { kind: 'goto', x: LOCATIONS.clubDoor.x, z: LOCATIONS.clubDoor.z, r: 4.5, text: 'Collect the harbour papers from Silvio' },
      { kind: 'escape', x: LOCATIONS.pierEnd.x, z: LOCATIONS.pierEnd.z, r: 6, text: 'Escape to the pier — the boat is waiting', heat: 4 },
    ],
    outro: [['Pilar Duarte', 'It is done. The tide goes out, and Costa Vera is yours now. Spend it well.']],
  },
];

const REPEAT_TARGETS = [
  { x: -34, z: 196, label: 'Café Brisa' },
  { x: 110, z: -103, label: 'the Comisaría clerk' },
  { x: -214, z: 0, label: 'the Clínica del Sol' },
  { x: 0, z: 288, label: 'the pier end' },
  { x: 0, z: -224, label: 'the Hotel Coral' },
  { x: 210, z: -110, label: 'Club Brisa' },
];

export class Story {
  // fx: callbacks into the game shell (dialogue, pay, wanted, heat, ending…)
  constructor(fx) {
    this.fx = fx;
    this.jobIndex = 0; // next job to offer; JOBS.length means story complete
    this.active = false;
    this.repeat = false;
    this.stepIndex = 0;
    this.marker = null;
    this.objective = '';
    this.timer = -1;
    this.waitingDialogue = false;
    this.runner = null;
    this.passenger = null;
    this.passengerName = '';
    this.heatFloor = 0;
  }

  get storyDone() {
    return this.jobIndex >= JOBS.length;
  }

  currentJob() {
    if (this.repeat) return { title: 'Encargo de Pilar', pay: 120 };
    return JOBS[this.jobIndex] || null;
  }

  talkPoint() {
    return LOCATIONS.pilar;
  }

  canTalk(player) {
    return !this.active && dist2d(player.x, player.z, LOCATIONS.pilar.x, LOCATIONS.pilar.z) < 4.2;
  }

  startNext() {
    if (this.active) return;
    this.repeat = this.storyDone;
    const job = this.currentJob();
    this.active = true;
    this.stepIndex = 0;
    if (this.repeat) {
      const t = REPEAT_TARGETS[Math.floor(rng() * REPEAT_TARGETS.length)];
      this.repeatTarget = t;
      this.jobs = null;
      this.fx.dialogue([['Pilar Duarte', 'Another small tide to move, cariño. Take this to ' + t.label + '.']], () => {});
      this.applyStep({ kind: 'goto', x: t.x, z: t.z, r: 5.5, text: 'Deliver the parcel to ' + t.label });
      return;
    }
    this.fx.dialogue(job.intro, () => {});
    this.applyStep(job.steps[0]);
  }

  applyStep(step) {
    this.current = step;
    this.objective = step.text;
    this.marker = step.kind === 'chase' ? null : { x: step.x, z: step.z };
    this.timer = step.timer || -1;
    if (step.crime) this.fx.addWanted(step.crime);
    if (step.heat) {
      this.heatFloor = step.heat;
      this.fx.setHeatFloor(step.heat);
      this.fx.setWantedAtLeast(step.heat);
    }
    if (step.kind === 'clear') {
      const pts = [
        [192, -96], [206, -96], [192, -124], [206, -124], [199, -110],
      ];
      this.fx.spawnHostiles(pts);
    }
    if (step.kind === 'chase') this.spawnRunner();
  }

  spawnRunner() {
    const scene = this.fx.scene;
    this.runner = {
      mesh: makePersonMesh({ shirt: 0xf4a259, pants: 0x2b2d42 }),
      x: LOCATIONS.marketDoor.x + 3,
      z: LOCATIONS.marketDoor.z + 6,
      heading: 2.6,
      phase: 0,
      caught: false,
    };
    this.runner.mesh.position.set(this.runner.x, 0, this.runner.z);
    scene.add(this.runner.mesh);
    this.fx.dialogue([
      ['Tomás Rey', 'Pilar sent YOU? Tell her the money is — look, a distraction!'],
      ['Tomás Rey', 'You will never catch Tomás Rey!'],
    ], () => {});
  }

  advance() {
    const job = this.currentJob();
    this.stepIndex++;
    const steps = this.repeat ? [] : JOBS[this.jobIndex].steps;
    if (this.repeat || this.stepIndex >= steps.length) {
      this.finishJob(job);
      return;
    }
    this.fx.toast('Objective updated');
    this.applyStep(steps[this.stepIndex]);
  }

  finishJob(job) {
    this.active = false;
    this.marker = null;
    this.objective = '';
    this.timer = -1;
    this.heatFloor = 0;
    this.fx.setHeatFloor(0);
    this.cleanupActors();
    this.fx.pay(job.pay, job.title);
    const wasFinale = !this.repeat && this.jobIndex === JOBS.length - 1;
    if (!this.repeat) {
      this.fx.dialogue(job.outro, () => {});
      this.jobIndex++;
    }
    if (wasFinale) this.fx.ending();
  }

  failJob(reason) {
    if (!this.active) return;
    this.active = false;
    this.marker = null;
    this.objective = '';
    this.timer = -1;
    this.heatFloor = 0;
    this.fx.setHeatFloor(0);
    this.fx.clearHostiles();
    this.cleanupActors();
    this.fx.toast(reason + ' — the job falls through. Pilar waits at the plaza.');
  }

  cleanupActors() {
    if (this.runner) {
      this.fx.scene.remove(this.runner.mesh);
      this.runner = null;
    }
    if (this.passenger) {
      this.fx.scene.remove(this.passenger);
      this.passenger = null;
    }
    this.passengerName = '';
  }

  // Called every frame by the shell. player: {x, z, vehicle}
  update(dt, player) {
    if (this.passengerName && !this.passenger) {
      this.passenger = makePersonMesh({ shirt: 0xd8402e, longHair: true });
      this.fx.scene.add(this.passenger);
    }
    if (this.passenger) {
      if (player.vehicle) {
        const v = player.vehicle;
        const sx = Math.cos(v.heading) * 0.45;
        const sz = -Math.sin(v.heading) * 0.45;
        this.passenger.position.set(v.x + sx, 0.55, v.z + sz);
        this.passenger.rotation.y = v.heading;
        this.passenger.visible = true;
      } else {
        this.passenger.visible = false;
      }
    }
    if (!this.active) return;
    const step = this.current;
    if (!step) return;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.failJob('Out of time');
        return;
      }
    }
    if (step.kind === 'goto' || step.kind === 'escape' || step.kind === 'deliver') {
      if (dist2d(player.x, player.z, step.x, step.z) < step.r) {
        const boarding = step.passenger;
        this.advance();
        if (boarding) {
          this.passengerName = boarding;
          this.fx.toast(boarding + ' is with you now');
        }
        return;
      }
    } else if (step.kind === 'drive') {
      if (player.vehicle && dist2d(player.x, player.z, step.x, step.z) < step.r) {
        this.advance();
        return;
      }
    } else if (step.kind === 'clear') {
      if (this.fx.aliveHostiles() === 0) {
        this.advance();
        return;
      }
    } else if (step.kind === 'chase' && this.runner) {
      const r = this.runner;
      // Tomás runs for the beach, weaving between the avenues.
      const dx = r.x - player.x;
      const dz = r.z - player.z;
      const d = Math.hypot(dx, dz);
      const flee = Math.atan2(dx, dz);
      const toSea = Math.atan2(0 - r.x, 250 - r.z);
      const dir = d < 26 ? flee : toSea;
      r.heading += clamp(((dir - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -3 * dt, 3 * dt);
      const sp = d < 20 ? 4.9 : 3.4;
      r.x += Math.sin(r.heading) * sp * dt;
      r.z += Math.cos(r.heading) * sp * dt;
      r.phase += dt * 11;
      animateWalk(r.mesh, r.phase, 1);
      r.mesh.position.set(r.x, 0, r.z);
      r.mesh.rotation.y = r.heading;
      this.marker = { x: r.x, z: r.z };
      if (d < 4.2) {
        this.fx.scene.remove(r.mesh);
        this.runner = null;
        this.fx.dialogue([['Tomás Rey', 'Enough! Enough! Tell Pilar — the money, all of it, tonight!']], () => {});
        this.advance();
        return;
      }
      if (r.z > 205) {
        this.failJob('Tomás reached the beach and vanished into the crowd');
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------

const GRAN_VUELTA_GATES = [
  [-165, 55], [-165, -55], [-165, -165], [-55, -165], [55, -165],
  [165, -165], [165, -55], [165, 55], [165, 165], [55, 165],
];
const BOARDWALK_GATES = [
  [-170, 196], [-102, 196], [-34, 196], [34, 196], [102, 196], [170, 196], [204, 196], [238, 196],
];

const PACKAGE_SPOTS = [
  [24, -30], [-30, 24], [0, 282], [-238, 190], [238, 190],
  [118, -96], [-118, 96], [60, 118], [-60, -118], [196, -84],
  [-196, 84], [14, -196], [-14, 150], [232, 196], [-232, 196],
];

export class Activities {
  constructor(fx) {
    this.fx = fx;
    this.race = null;
    this.packages = PACKAGE_SPOTS.map(([x, z], i) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.4, 0.24),
        new THREE.MeshBasicMaterial({ color: 0x7CFC9A })
      );
      mesh.position.set(x, 0.9, z);
      fx.scene.add(mesh);
      return { x, z, mesh, found: false, index: i };
    });
    this.taxi = { onDuty: false, stage: 'idle', farePed: null, dest: null, startDist: 0 };
    this.time = 0;
  }

  foundCount() {
    return this.packages.filter((p) => p.found).length;
  }

  foundFlags() {
    return this.packages.map((p) => p.found);
  }

  setFoundFlags(flags) {
    flags.forEach((f, i) => {
      if (this.packages[i]) {
        this.packages[i].found = !!f;
        this.packages[i].mesh.visible = !f;
      }
    });
  }

  raceStarts() {
    return [
      { id: 'vuelta', name: 'Gran Vuelta', x: LOCATIONS.raceAvenida.x, z: LOCATIONS.raceAvenida.z },
      { id: 'boardwalk', name: 'Boardwalk Run', x: LOCATIONS.boardwalkStart.x, z: LOCATIONS.boardwalkStart.z },
    ];
  }

  startRace(id) {
    const gates = id === 'vuelta' ? GRAN_VUELTA_GATES : BOARDWALK_GATES;
    this.race = {
      id,
      name: id === 'vuelta' ? 'Gran Vuelta' : 'Boardwalk Run',
      gates,
      idx: 0,
      time: 0,
      par: id === 'vuelta' ? 175 : 58,
      payFast: id === 'vuelta' ? 300 : 200,
      paySlow: id === 'vuelta' ? 120 : 80,
    };
    this.fx.toast(this.race.name + ' — follow the gold gates!');
    return this.race;
  }

  raceMarker() {
    if (!this.race) return null;
    const g = this.race.gates[this.race.idx];
    return { x: g[0], z: g[1] };
  }

  raceInfo() {
    if (!this.race) return null;
    return { name: this.race.name, gate: this.race.idx + 1, total: this.race.gates.length, time: this.race.time, par: this.race.par };
  }

  toggleTaxi(player) {
    const t = this.taxi;
    if (!player.vehicle || player.vehicle.type.id !== 'taxi') {
      this.fx.toast('Taxi duty needs a Taxímetro cab');
      return false;
    }
    if (t.onDuty) {
      this.endTaxi();
      this.fx.toast('Taxi duty off');
      return true;
    }
    t.onDuty = true;
    t.stage = 'pickup';
    this.spawnFare(player);
    this.fx.toast('Taxi duty on — pick up the fare');
    return true;
  }

  spawnFare(player) {
    const t = this.taxi;
    const spots = [
      [13, -60], [-68, 13], [68, -13], [-13, 178], [13, -178],
      [-178, -68], [178, 68], [-121, -13], [121, 13], [0, 190],
    ];
    let spot = spots[Math.floor(rng() * spots.length)];
    for (const s of spots) {
      if (dist2d(s[0], s[1], player.x, player.z) > 70) { spot = s; break; }
    }
    const ped = new Pedestrian(this.fx.scene, spot[0], spot[1]);
    ped.idleFor = 99999;
    ped.tx = spot[0];
    ped.tz = spot[1];
    t.farePed = ped;
    t.farePoint = { x: spot[0], z: spot[1] };
  }

  endTaxi() {
    const t = this.taxi;
    t.onDuty = false;
    t.stage = 'idle';
    if (t.farePed) {
      t.farePed.dispose(this.fx.scene);
      t.farePed = null;
    }
    t.dest = null;
  }

  taxiMarker() {
    const t = this.taxi;
    if (!t.onDuty) return null;
    if (t.stage === 'pickup' && t.farePoint) return t.farePoint;
    if (t.stage === 'dropoff' && t.dest) return t.dest;
    return null;
  }

  update(dt, player) {
    this.time += dt;
    for (const p of this.packages) {
      if (p.found) continue;
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.position.y = 0.9 + Math.sin(this.time * 2.4 + p.index) * 0.16;
      if (dist2d(player.x, player.z, p.x, p.z) < 2.8) {
        p.found = true;
        p.mesh.visible = false;
        const n = this.foundCount();
        this.fx.pay(25, 'Hidden package ' + n + '/15');
        this.fx.audioPickup();
        if (n === 15) this.fx.pay(250, 'All 15 packages — Costa Vera completionist');
      }
    }
    if (this.race) {
      this.race.time += dt;
      const g = this.race.gates[this.race.idx];
      if (player.vehicle && dist2d(player.x, player.z, g[0], g[1]) < 10) {
        this.race.idx++;
        this.fx.audioGate();
        if (this.race.idx >= this.race.gates.length) {
          const fast = this.race.time <= this.race.par;
          this.fx.pay(fast ? this.race.payFast : this.race.paySlow, this.race.name + (fast ? ' — under par!' : ' — finished'));
          this.fx.toast(this.race.name + ' finished in ' + this.race.time.toFixed(1) + 's');
          this.race = null;
        } else {
          this.fx.toast('Gate ' + this.race.idx + '/' + this.race.gates.length);
        }
      }
    }
    const t = this.taxi;
    if (t.onDuty && t.farePed) t.farePed.update(0, this.fx.colliders);
    if (t.onDuty && player.vehicle && player.vehicle.type.id === 'taxi') {
      if (t.stage === 'pickup' && t.farePoint) {
        if (dist2d(player.x, player.z, t.farePoint.x, t.farePoint.z) < 6.5 && Math.abs(player.speed) < 1.2) {
          t.farePed.dispose(this.fx.scene);
          t.farePed = null;
          const dests = [
            [0, 190], [-178, 13], [178, -13], [13, 121], [-13, -121],
            [196, -110], [-214, 0], [0, -224], [110, 102], [-110, -103],
          ];
          t.dest = dests[Math.floor(rng() * dests.length)];
          t.dest = { x: t.dest[0], z: t.dest[1] };
          t.startDist = dist2d(player.x, player.z, t.dest.x, t.dest.z);
          t.stage = 'dropoff';
          this.fx.toast('Fare aboard — take them to the marker');
        }
      } else if (t.stage === 'dropoff' && t.dest) {
        if (dist2d(player.x, player.z, t.dest.x, t.dest.z) < 8 && Math.abs(player.speed) < 1.2) {
          const fare = Math.round(12 + t.startDist * 0.09);
          this.fx.pay(fare, 'Taxi fare');
          this.fx.toast('Fare paid ' + fare + ' — next fare incoming');
          t.stage = 'pickup';
          this.spawnFare(player);
        }
      }
    }
    if (t.onDuty && !player.vehicle) this.endTaxiSilent();
  }

  endTaxiSilent() {
    const t = this.taxi;
    t.onDuty = false;
    t.stage = 'idle';
    if (t.farePed) {
      t.farePed.dispose(this.fx.scene);
      t.farePed = null;
    }
    t.dest = null;
  }
}
