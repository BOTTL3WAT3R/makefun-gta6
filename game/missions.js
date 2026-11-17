// missions.js — the story of Nico Ferrer: six jobs for fixer Pilar Duarte,
// chained from errand boy to the Golden Hour job, plus the city's side
// hustle — taxi fares, the boardwalk checkpoint race, hidden packages —
// and the three shops. Owns the objective line and the waypoint beam.

import * as THREE from 'three';
import { LOCATIONS, SHOPS } from './world.js';
import { makeCar } from './vehicles.js';
import { makePersonMesh } from './people.js';
import { dist2d, clamp, fmtCash, fmtTime, rand, pick } from './util.js';

const D = (who, text) => ({ who, text });
const STORY = [
  {
    title: 'Primera Marea', sub: 'First Tide — a briefcase by the marina',
    reward: 250,
    intro: [D('PILAR (phone)', 'Nico. You owe half the boardwalk money. Work it off: a case waits at the Marina del Sol office. Bring it to my club — and smile for the cameras.'),
            D('NICO', 'A case. Sure. Nothing ever goes wrong with cases.')],
    steps: [
      { kind: 'goto', pos: LOCATIONS.marina, r: 7, label: 'Pick up the case at the Marina del Sol office' },
      { kind: 'goto', pos: LOCATIONS.club, r: 6, onFoot: true, label: 'Deliver the case to Pilar at Club Brisa' },
    ],
    outro: [D('PILAR', 'Clean work. The city pays people who finish. Come back — I have a shopping list.')],
  },
  {
    title: 'Coche Prestado', sub: 'Borrowed Car — the gold Tormenta at Hotel Palma',
    reward: 400,
    intro: [D('PILAR (phone)', 'A guest at Hotel Palma parks a gold Tormenta GT with the valet and owes me a fortune. Take the car. Leave the valet his tip and his teeth.'),
            D('NICO', 'Steal a gold sports car in broad sunset. Subtle.')],
    steps: [
      { kind: 'goto', pos: LOCATIONS.hotel, r: 9, label: 'Reach the Hotel Palma valet stand' },
      { kind: 'steal', label: 'Steal the gold Tormenta GT from the valet' },
      { kind: 'deliverCar', pos: LOCATIONS.garage, r: 10, label: 'Deliver the Tormenta to Taller Sol' },
    ],
    outro: [D('PILAR', 'Beautiful. Word travels: Tormentas are appearing all over the city now. Enjoy.')],
  },
  {
    title: 'La Ronda', sub: 'The Round — three envelopes, one clock',
    reward: 600, timer: 240,
    intro: [D('PILAR (phone)', 'Collection round, cariño. Envelopes wait at the clinic, the gun shop and the hotel. On foot at each door, then back to me. The clock is not your friend.')],
    steps: [
      { kind: 'goto', pos: LOCATIONS.clinic, r: 5, onFoot: true, label: 'Collect the envelope at Clínica Brisa' },
      { kind: 'goto', pos: LOCATIONS.gunshop, r: 5, onFoot: true, label: 'Collect the envelope at Armería Faro' },
      { kind: 'goto', pos: LOCATIONS.hotel, r: 6, onFoot: true, label: 'Collect the envelope at Hotel Palma' },
      { kind: 'goto', pos: LOCATIONS.club, r: 6, onFoot: true, label: 'Bring the envelopes to Pilar at Club Brisa' },
    ],
    outro: [D('PILAR', 'Every door paid. You are becoming expensive to ignore, Nico.')],
  },
  {
    title: 'Pasajero Caliente', sub: 'Hot Passenger — Ivo the accountant wants out',
    reward: 800,
    intro: [D('PILAR (phone)', 'Ivo, El Pulpo’s accountant, is done counting other people’s money. He waits at the Faro point parking. The Policía will object. Lose them, then the safehouse on Calle Niebla.')],
    steps: [
      { kind: 'pickup', pos: LOCATIONS.lighthouse, r: 8, label: 'Pick up Ivo at the Faro point parking (in a car)' },
      { kind: 'escape', label: 'Lose the Policía del Sol — wanted level to zero' },
      { kind: 'goto', pos: LOCATIONS.safehouse, r: 9, needCar: true, label: 'Deliver Ivo to the safehouse on Calle Niebla' },
    ],
    outro: [D('IVO', 'I will tell Pilar everything. The boats, the books, the second books…'),
            D('PILAR', 'Then El Pulpo’s days are numbered in single digits.')],
  },
  {
    title: 'Pulpo a la Parrilla', sub: 'Grilled Octopus — run Rico Sanz off his throne',
    reward: 1000,
    intro: [D('PILAR (phone)', 'Rico “El Pulpo” Sanz cruises downtown in a black Tormenta, counting my money. Introduce his car to every wall in Costa Vera. Then meet me at the yacht.')],
    steps: [
      { kind: 'ram', label: 'Wreck El Pulpo’s black Tormenta (ram it until it dies)' },
      { kind: 'goto', pos: { x: 182, z: 206 }, r: 9, label: 'Meet Pilar at the Marina del Sol pier' },
    ],
    outro: [D('EL PULPO (phone)', 'You drive like a weather event, Ferrer! This city was mine!'),
            D('PILAR', 'Was. One job left, Nico. The Golden Hour job.')],
  },
  {
    title: 'Hora Dorada', sub: 'Golden Hour — the crown case, every cop in the city',
    reward: 2000,
    intro: [D('PILAR', 'Inside the club is the crown case — every debt, every deed, the whole city in one box. Take it to my yacht before the light dies. Every patrol in Costa Vera will try to stop you.'),
            D('NICO', 'Then I drive fast, Pilar. I have been practicing.')],
    steps: [
      { kind: 'goto', pos: LOCATIONS.club, r: 6, onFoot: true, label: 'Take the crown case inside Club Brisa' },
      { kind: 'goto', pos: { x: 182, z: 206 }, r: 10, label: 'Deliver the crown case to the yacht at Marina del Sol', lock: 4 },
    ],
    outro: [D('PILAR', 'It is done. The debts, the deeds, the boardwalk — ours. Costa Vera is yours at golden hour, Nico.')],
  },
];
const RACE_GATES = [
  { x: 120, z: 160 }, { x: 200, z: 84 }, { x: 124, z: 4 }, { x: 196, z: -76 },
  { x: 44, z: -156 }, { x: -116, z: -84 }, { x: -196, z: 4 }, { x: -44, z: 84 },
];
const RACE_PAR = 150;

export class Missions {
  constructor(scene, world, G) {
    this.world = world;
    this.storyIndex = 0; this.active = null; this.dialogueQ = [];
    this.dialogueAt = 0; this.jobT = 0;
    // Waypoint beam + ring, moved to whatever the current objective is.
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.y = 21; scene.add(this.beam);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 26),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.12; scene.add(this.ring);
    // The pickup case prop (marina / club), shown when a step needs it.
    this.caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.24, 0.44),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2a, emissive: 0xff9a3d, emissiveIntensity: 0.7 }));
    this.caseMesh.visible = false; scene.add(this.caseMesh);
    // Hidden packages.
    this.packages = new Map();
    const pkgGeo = new THREE.BoxGeometry(0.55, 0.38, 0.55);
    const pkgMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57, emissive: 0x39ff88, emissiveIntensity: 0.55 });
    for (const s of world.packageSpots) {
      const m = new THREE.Mesh(pkgGeo, pkgMat);
      m.position.set(s.x, 0.7, s.z); scene.add(m);
      this.packages.set(s.id, { ...s, mesh: m, taken: false });
    }
    // Ivo, the accountant (his own little mesh, shown at the lighthouse).
    this.ivo = makePersonMesh(0xf2f2ee, 0x2c3550, 0xc98d5e, 0x2c3550);
    this.ivo.position.set(LOCATIONS.lighthouse.x + 2, 0, LOCATIONS.lighthouse.z + 1);
    this.ivo.visible = false; scene.add(this.ivo);
    this.rival = null; this.fare = null; this.race = null;
    this.taxiPed = null;
  }
  restore(G) { // apply a loaded save: story progress + packages
    for (const p of this.packages.values())
      if (G.packagesFound.has(p.id)) { p.taken = true; p.mesh.visible = false; }
  }
  queueDialogue(lines) { for (const l of lines) this.dialogueQ.push(l); }
  startJob(G, idx) {
    const job = STORY[idx];
    this.active = { job, idx, step: 0, t: 0 };
    this.jobT = 0;
    G.hud.banner(job.title, job.sub, 4);
    this.queueDialogue(job.intro);
    if (job.title.startsWith('Pulpo')) this.spawnRival(G);
    if (job.title.startsWith('Pasajero')) this.ivo.visible = true;
    if (idx === 1) { // the valet Tormenta must be stealable, wherever it ended up
      const v = G.valetCar;
      v.health = 100; v.dead = false; v.speed = 0; v.driver = 'parked';
      v.x = LOCATIONS.valetCar.x; v.z = LOCATIONS.valetCar.z; v.angle = LOCATIONS.valetCar.angle;
      v.mesh.position.set(v.x, 0, v.z); v.mesh.rotation.y = v.angle;
    }
    this.applyStepFx(G);
  }
  applyStepFx(G) {
    const step = this.active && this.active.job.steps[this.active.step];
    G.police.setLock(step && step.lock ? step.lock : 0);
    this.caseMesh.visible = !!step && this.active.step === 0 && (this.active.idx === 0 || this.active.idx === 5);
    if (this.caseMesh.visible) {
      const p = this.active.idx === 0 ? LOCATIONS.marina : LOCATIONS.club;
      this.caseMesh.position.set(p.x, 0.8, p.z);
    }
  }
  spawnRival(G) {
    const car = makeCar('sport', -30, 6, Math.PI / 2, 'rival', 0x15151a);
    car.health = 130;
    this.rival = car; G.spawnCar(car);
    G.hud.toast('El Pulpo cruises downtown — find the black Tormenta', 3.4);
  }
  failJob(G, why) {
    G.hud.banner('JOB FAILED', why, 3);
    G.audio.fail();
    G.police.setLock(0);
    if (this.rival) { G.despawnCar(this.rival); this.rival = null; }
    const idx = this.active.idx;
    this.active = null;
    setTimeout(() => { if (!this.active) this.startJob(G, idx); }, 3600);
  }
  completeJob(G) {
    const { job, idx } = this.active;
    G.cash += job.reward;
    G.audio.success(); G.audio.cash();
    G.hud.banner('JOB COMPLETE', job.title + ' — ' + fmtCash(job.reward), 3.6);
    this.queueDialogue(job.outro);
    this.storyIndex = idx + 1;
    this.active = null;
    G.police.setLock(0);
    if (this.rival) { G.despawnCar(this.rival); this.rival = null; }
    if (idx === STORY.length - 1) G.onEnding();
    G.save();
  }
  stepDone(G) {
    this.active.step++;
    G.audio.pickup();
    if (this.active.step >= this.active.job.steps.length) this.completeJob(G);
    else this.applyStepFx(G);
  }
  // What pressing E near something does; main asks every frame.
  getInteract(G) {
    const P = G.player;
    if (P.onFoot) {
      for (const s of SHOPS) {
        if (dist2d(P.x, P.z, s.door.x, s.door.z) < 5) {
          return { text: 'E — ' + s.name + ': ' + s.service, action: () => this.useShop(G, s) };
        }
      }
    } else if (P.car && dist2d(P.car.x, P.car.z, LOCATIONS.garage.x, LOCATIONS.garage.z) < 11) {
      return { text: 'E — TALLER SOL: full repair — $60', action: () => this.useShop(G, SHOPS[0], true) };
    }
    if (!P.onFoot && !this.race && !this.active && dist2d(P.car.x, P.car.z, LOCATIONS.raceStart.x, LOCATIONS.raceStart.z) < 7) {
      return { text: 'E — start the Boardwalk Run (8 gates, par ' + fmtTime(RACE_PAR) + ', prize $300)', action: () => this.startRace(G) };
    }
    return null;
  }
  useShop(G, shop, driveIn = false) {
    const P = G.player;
    const pay = n => { if (G.cash < n) { G.hud.toast('Not enough cash', 1.8); G.audio.fail(); return false; } G.cash -= n; G.audio.cash(); return true; };
    if (shop.id === 'clinic') { if (P.health >= 100) { G.hud.toast('Already at full health', 1.6); return; } if (pay(40)) { P.health = 100; G.hud.toast('Patched up — full health', 2); } }
    if (shop.id === 'gun') { if (P.armor >= 100) { G.hud.toast('Armor already maxed', 1.6); return; } if (pay(100)) { P.armor = 100; G.hud.toast('Body armor fitted', 2); } }
    if (shop.id === 'garage') {
      const car = P.car || G.lastCar;
      if (!car) { G.hud.toast('Bring a car to the garage first', 1.8); return; }
      if (car.health >= 100 && !car.dead) { G.hud.toast('This car needs nothing', 1.6); return; }
      if (pay(60)) { car.health = 100; car.dead = false; G.hud.toast('Good as new — ' + car.spec.name, 2); }
    }
    G.save();
  }
  startRace(G) {
    this.race = { gate: 0, t: 0 };
    G.hud.banner('BOARDWALK RUN', 'Hit every gate — beat ' + fmtTime(RACE_PAR) + ' for $300', 3.2);
    G.audio.success();
  }
  // Taxi work: hail a pedestrian while driving a taxi.
  updateTaxi(G, dt) {
    const P = G.player;
    if (this.fare) {
      const f = this.fare;
      if (P.onFoot) { /* fare waits in the car… but the player left: cancel */
        this.endFare(G, false); return;
      }
      f.t += dt;
      if (dist2d(P.car.x, P.car.z, f.dest.x, f.dest.z) < 9 && Math.abs(P.car.speed) < 3) {
        const payAmt = Math.round(20 + f.dist * 0.35 + (f.t < f.dist * 0.09 ? 12 : 0));
        G.cash += payAmt; G.audio.cash();
        G.hud.toast('Fare paid ' + fmtCash(payAmt) + (f.t < f.dist * 0.09 ? ' — with a fast tip!' : ''), 2.6);
        f.ped.state = 'walk'; f.ped.mesh.visible = true;
        G.people.placeOnSidewalk(f.ped, f.dest.x, f.dest.z);
        this.fare = null; G.save();
      }
      return;
    }
    if (this.taxiPed) { // waiting for pickup
      const ped = this.taxiPed;
      if (!P.onFoot && P.car.type === 'taxi' && Math.abs(P.car.speed) < 2 && dist2d(P.car.x, P.car.z, ped.x, ped.z) < 4.5) {
        ped.state = 'ride'; ped.mesh.visible = false; ped.hail = false;
        const dest = pick([LOCATIONS.club, LOCATIONS.hotel, LOCATIONS.marina, LOCATIONS.clinic,
          LOCATIONS.gunshop, LOCATIONS.safehouse, { x: -196, z: -156 }, { x: 196, z: 76 }]);
        const dist = dist2d(P.car.x, P.car.z, dest.x, dest.z);
        this.fare = { ped, dest, dist, t: 0 };
        this.taxiPed = null;
        G.hud.dialogue('FARE', '“' + (dest.name || 'Across town') + ', friend — and step on it.”', 3);
        G.audio.pickup();
      } else if (P.onFoot || (P.car && P.car.type !== 'taxi')) { ped.hail = false; ped.state = 'walk'; this.taxiPed = null; }
      return;
    }
    if (!P.onFoot && P.car.type === 'taxi' && !this.active) {
      let best = null, bd = 70;
      for (const ped of G.people.peds) {
        if (ped.state !== 'walk') continue;
        const d = dist2d(P.car.x, P.car.z, ped.x, ped.z);
        if (d < bd) { bd = d; best = ped; }
      }
      if (best) { best.hail = true; best.state = 'walk'; this.taxiPed = best; }
    }
  }
  endFare(G, silent) {
    if (this.fare) {
      this.fare.ped.state = 'walk'; this.fare.ped.mesh.visible = true;
      G.people.placeOnSidewalk(this.fare.ped, G.player.x + 20, G.player.z + 20);
      this.fare = null;
    }
    if (!silent) G.hud.toast('Fare lost', 1.8);
  }
  update(dt, G) {
    // Dialogue queue: one line at a time.
    if (this.dialogueQ.length && performance.now() >= this.dialogueAt) {
      const l = this.dialogueQ.shift();
      G.hud.dialogue(l.who, l.text, 4.4);
      this.dialogueAt = performance.now() + 4500;
    }
    // Rival flee AI during job 5.
    if (this.rival && !this.rival.dead) {
      const r = this.rival, P = G.player;
      const px = P.onFoot ? P.x : P.car.x, pz = P.onFoot ? P.z : P.car.z;
      const away = Math.atan2(r.x - px, r.z - pz);
      const tx = clamp(r.x + Math.sin(away) * 46, -240, 240), tz = clamp(r.z + Math.cos(away) * 46, -205, 155);
      const desired = Math.atan2(tx - r.x, tz - r.z);
      const diff = ((desired - r.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      r.angle += clamp(diff, -r.spec.turn * dt, r.spec.turn * dt);
      const want = r.spec.topSpeed * 0.82;
      r.speed += clamp(want - r.speed, -20 * dt, r.spec.accel * dt);
      r.x += Math.sin(r.angle) * r.speed * dt; r.z += Math.cos(r.angle) * r.speed * dt;
      r.mesh.position.set(r.x, 0, r.z); r.mesh.rotation.y = r.angle;
    }
    // Packages: bob, spin, collect on foot.
    const t = performance.now() * 0.001;
    for (const p of this.packages.values()) {
      if (p.taken) continue;
      p.mesh.rotation.y = t * 1.6; p.mesh.position.y = 0.7 + Math.sin(t * 2 + p.id) * 0.14;
      if (G.player.onFoot && dist2d(G.player.x, G.player.z, p.x, p.z) < 1.9) {
        p.taken = true; p.mesh.visible = false;
        G.packagesFound.add(p.id); G.cash += 25;
        G.audio.pickup();
        G.hud.toast('Hidden package ' + G.packagesFound.size + '/15 — +$25', 2.2);
        G.save();
      }
    }
    this.updateTaxi(G, dt);
    // Race gates.
    if (this.race) {
      const r = this.race; r.t += dt;
      const gate = RACE_GATES[r.gate];
      G.objectivePos = gate;
      G.objectiveText = 'Boardwalk Run — gate ' + (r.gate + 1) + '/8 · ' + fmtTime(r.t);
      if (!G.player.onFoot && dist2d(G.player.car.x, G.player.car.z, gate.x, gate.z) < 10) {
        r.gate++; G.audio.pickup();
        if (r.gate >= RACE_GATES.length) {
          const prize = r.t <= RACE_PAR ? 300 : 50;
          G.cash += prize; G.audio.success();
          G.hud.banner('RACE FINISHED', fmtTime(r.t) + ' — prize ' + fmtCash(prize), 3.4);
          if (!G.raceBest || r.t < G.raceBest) G.raceBest = r.t;
          this.race = null; G.save();
        }
      }
      return;
    }
    if (this.fare) {
      G.objectivePos = this.fare.dest;
      G.objectiveText = 'Taxi fare — drive your passenger to the marker';
      G.jobProgress = 'Fare meter running…';
      return;
    }
    if (this.taxiPed) {
      G.objectivePos = { x: this.taxiPed.x, z: this.taxiPed.z };
      G.objectiveText = 'Taxi — stop beside the hailing passenger';
      return;
    }
    // Story flow.
    if (!this.active) {
      if (this.storyIndex < STORY.length) {
        const next = STORY[this.storyIndex];
        G.objectivePos = LOCATIONS.club;
        G.objectiveText = 'See Pilar at Club Brisa — next job: “' + next.title + '”';
        G.jobProgress = 'Story job ' + (this.storyIndex + 1) + ' of ' + STORY.length + ' · Packages ' + G.packagesFound.size + '/15';
        if (G.player.onFoot && dist2d(G.player.x, G.player.z, LOCATIONS.club.x, LOCATIONS.club.z) < 7)
          this.startJob(G, this.storyIndex);
      } else {
        G.objectivePos = null;
        G.objectiveText = 'Free roam — the city is yours. Taxi fares, the Boardwalk Run and 15 packages remain.';
        G.jobProgress = 'Story complete · Packages ' + G.packagesFound.size + '/15' + (G.raceBest ? ' · Best race ' + fmtTime(G.raceBest) : '');
      }
      this.beam.visible = this.ring.visible = !!G.objectivePos;
      if (G.objectivePos) this.placeMarker(G.objectivePos, t);
      return;
    }
    // Active job.
    const a = this.active, job = a.job, step = job.steps[a.step];
    a.t += dt; this.jobT += dt;
    if (job.timer) {
      const left = job.timer - a.t;
      G.jobProgress = 'Time left ' + fmtTime(Math.max(0, left));
      if (left <= 0) { this.failJob(G, 'The round took too long. Pilar resends you.'); return; }
    } else G.jobProgress = 'Job: ' + job.title + ' — step ' + (a.step + 1) + '/' + job.steps.length;
    G.objectiveText = step.label;
    this.caseMesh.rotation.y = t * 2;
    const P = G.player;
    const px = P.onFoot ? P.x : P.car.x, pz = P.onFoot ? P.z : P.car.z;
    switch (step.kind) {
      case 'goto':
        G.objectivePos = step.pos;
        if (dist2d(px, pz, step.pos.x, step.pos.z) < step.r && (!step.onFoot || P.onFoot) && (!step.needCar || !P.onFoot)) this.stepDone(G);
        break;
      case 'steal':
        G.objectivePos = { x: G.valetCar.x, z: G.valetCar.z };
        if (!P.onFoot && P.car === G.valetCar) this.stepDone(G);
        break;
      case 'deliverCar':
        G.objectivePos = step.pos;
        if (!P.onFoot && P.car === G.valetCar && dist2d(P.car.x, P.car.z, step.pos.x, step.pos.z) < step.r) this.stepDone(G);
        else if (G.valetCar.dead) this.failJob(G, 'The Tormenta is wrecked. Pilar is… displeased.');
        break;
      case 'pickup':
        G.objectivePos = step.pos;
        if (!P.onFoot && dist2d(P.car.x, P.car.z, step.pos.x, step.pos.z) < step.r && Math.abs(P.car.speed) < 3) {
          this.ivo.visible = false;
          G.police.reportCrime('mission', P.car.x, P.car.z, G);
          G.police.heat = Math.max(G.police.heat, 3);
          G.hud.dialogue('IVO', 'Drive, drive! Half the Policía are behind us!', 3.6);
          this.stepDone(G);
        }
        break;
      case 'escape':
        G.objectivePos = null;
        G.objectiveText = step.label + ' (now: ' + G.police.stars() + '★)';
        if (G.police.stars() === 0) this.stepDone(G);
        break;
      case 'ram':
        if (this.rival) {
          G.objectivePos = { x: this.rival.x, z: this.rival.z };
          if (this.rival.dead || this.rival.health <= 18) {
            G.hud.toast('El Pulpo’s Tormenta is finished!', 2.6);
            this.stepDone(G);
          }
        }
        break;
    }
    this.beam.visible = this.ring.visible = !!G.objectivePos;
    if (G.objectivePos) this.placeMarker(G.objectivePos, t);
  }
  placeMarker(pos, t) {
    this.beam.position.set(pos.x, 21, pos.z);
    this.ring.position.set(pos.x, 0.12, pos.z);
    const s = 1 + Math.sin(t * 3) * 0.12;
    this.ring.scale.set(s, s, 1);
  }
}
