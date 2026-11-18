// missions.js — the story of Golden Hour: seven jobs from fixer Pilar
// Duarte, plus everything else Costa Vera pays for — taxi fares, two
// checkpoint races, fifteen hidden packages and three working shops.

import { clamp, headingOf } from './util.js';
import { LAYOUT } from './world.js';
import { makePersonMesh } from './people.js';

const PILAR_POS = { x: 20, z: 15 };

const JOBS = [
  {
    title: 'First Run', pay: 150,
    intro: [
      ['PILAR DUARTE', 'Nico Ferrer. Heard you can drive and keep your mouth shut. Both are rare here.'],
      ['PILAR DUARTE', 'A cooler is sitting at the end of the marina pier. Bring it back to me. That is the whole job.'],
    ],
    steps: [
      { type: 'dwell', x: -152, z: 300, label: 'Pick up the cooler at the end of the pier' },
      { type: 'goto', x: PILAR_POS.x, z: PILAR_POS.z, label: 'Bring the cooler back to Pilar' },
    ],
  },
  {
    title: 'Cold Open', pay: 220,
    intro: [
      ['PILAR DUARTE', 'A restaurant on the north-west block ordered ice and silence. Mostly silence.'],
      ['PILAR DUARTE', 'Pick up at the warehouse, drop it at the beach bar. The clock is rude — move.'],
    ],
    steps: [
      { type: 'dwell', x: -196, z: -120, label: 'Load up at the warehouse' },
      { type: 'goto', x: 96, z: 186, label: 'Deliver to the beach bar', time: 150 },
    ],
  },
  {
    title: 'Tail Lights', pay: 300,
    intro: [
      ['PILAR DUARTE', 'A courier in a yellow hatch is moving something of mine without permission.'],
      ['PILAR DUARTE', 'Stay on his tail — close, but do not trade paint. Learn where he stops.'],
    ],
    steps: [
      { type: 'chase', label: 'Tail the yellow courier — stay close, stay unseen' },
      { type: 'goto', x: -60, z: -170, label: 'Note the drop: the north alley. Now report to Pilar', report: true },
    ],
  },
  {
    title: 'Night Deposit', pay: 380,
    intro: [
      ['PILAR DUARTE', 'Threads owes me a deposit bag. It leaves the shop tonight, in your hands.'],
      ['PILAR DUARTE', 'The marina buyer pays cash. If the law notices the bag, lose them or lose the fee.'],
    ],
    steps: [
      { type: 'dwell', x: 114, z: -104, label: 'Collect the deposit bag outside Threads' },
      { type: 'goto', x: -152, z: 250, label: 'Deliver to the buyer on the pier', heat: 200 },
    ],
  },
  {
    title: 'Loud Music', pay: 520,
    intro: [
      ['PILAR DUARTE', 'Club Brisa stopped paying for protection. Their new friends carry guns and grudges.'],
      ['PILAR DUARTE', 'Go to the club. Settle it in the car park. Then come home.'],
    ],
    steps: [
      { type: 'goto', x: 190, z: 184, label: 'Go to Club Brisa' },
      { type: 'shootout', x: 190, z: 184, count: 4, label: 'Clear the car park — hostiles at Club Brisa' },
      { type: 'goto', x: PILAR_POS.x, z: PILAR_POS.z, label: 'Report back to Pilar', report: true },
    ],
  },
  {
    title: 'Grand Theft Otto', pay: 650,
    intro: [
      ['PILAR DUARTE', 'Otto Lindqvist parks his Vela GT on the north-east block and brags about the alarm.'],
      ['PILAR DUARTE', 'Steal it. Park it in the west lockup. Try not to gift-wrap it around a lamppost.'],
    ],
    steps: [
      { type: 'steal', x: 152, z: -128, label: 'Steal the marked Vela GT' },
      { type: 'goto', x: -222, z: -38, label: 'Park the GT in the west lockup', heat: 150, inStolen: true },
    ],
  },
  {
    title: 'La Última Marea', pay: 3000,
    intro: [
      ['PILAR DUARTE', 'Last one, Nico. My sister is at Club Brisa with a bag that half the city wants.'],
      ['PILAR DUARTE', 'Bring her to the pier. Whatever happens — do not stop the car.'],
    ],
    steps: [
      { type: 'goto', x: 190, z: 184, label: 'Pick up Lucia at Club Brisa' },
      { type: 'escape', x: -152, z: 296, label: 'ESCAPE — get Lucia to the end of the pier' },
    ],
  },
];

export function createMissions(THREE, scene, G) {
  // Pilar herself, waiting by the fountain.
  const pilar = makePersonMesh(THREE, 0xb06ab3, 0x27313d, 0xa96b3f, null);
  pilar.position.set(PILAR_POS.x, 0, PILAR_POS.z);
  pilar.rotation.y = 2.4;
  scene.add(pilar);

  // The objective marker: a spinning gold diamond over a ground ring.
  const marker = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  gem.position.y = 3.2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  marker.add(gem, ring); scene.add(marker);

  // Hidden packages: glowing teal octahedra.
  const packages = G.world.packageSpots.map((s, i) => {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
      new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }));
    mesh.position.set(s.x, 1.1, s.z);
    scene.add(mesh);
    return { ...s, i, mesh, taken: G.progress.packages.includes(i) };
  });
  for (const p of packages) p.mesh.visible = !p.taken;

  const state = {
    jobIndex: G.progress.jobIndex, active: null, stepIdx: 0, stepT: 0,
    dlgQueue: [], dlgT: 0, chaseCar: null, tailTime: 0, hostiles: [],
    race: null, taxi: null, taxiCd: 8, stolenCar: null, done: G.progress.jobIndex >= JOBS.length,
  };

  function say(lines) { state.dlgQueue.push(...lines); }
  function currentStep() {
    return state.active ? state.active.steps[state.stepIdx] : null;
  }
  function setObjectiveForStep() {
    const s = currentStep();
    if (!s) return;
    if (s.type === 'chase' && state.chaseCar) {
      G.hud.setObjective(s.label, state.chaseCar.pos.x, state.chaseCar.pos.z, 'JOB ' + (state.jobIndex + 1));
    } else {
      G.hud.setObjective(s.label, s.x, s.z, 'JOB ' + (state.jobIndex + 1));
    }
  }

  function startJob(idx) {
    state.active = JOBS[idx];
    state.stepIdx = 0; state.stepT = 0; state.tailTime = 0;
    G.hud.jobCard('STORY JOB ' + (idx + 1) + ' OF 7', state.active.title, 'For Pilar Duarte · ' + '$' + state.active.pay + ' on completion');
    say(state.active.intro);
    beginStep();
  }

  function beginStep() {
    const s = currentStep();
    if (!s) return;
    state.stepT = 0;
    if (s.heat) G.police.addHeat(s.heat, 'job heat');
    if (s.type === 'chase') {
      state.chaseCar = G.fleet.spawnOne('hatch', 0xffd23e, null);
      G.combat.registerTarget(state.chaseCar.mesh, 'car', state.chaseCar);
      state.chaseCar.pos.set(-228, 0, -38);
      state.chaseCar.heading = Math.PI / 2;
      state.chaseCar.mode = 'traffic';
      state.chaseCar.loop = { cx: -114, cz: -38, half: 42.2, dir: 1 };
      state.chaseCar.cruise = 13.5;
      state.tailTime = 0;
    }
    if (s.type === 'shootout') spawnHostiles(s);
    if (s.type === 'steal') {
      state.stolenCar = G.fleet.spawnOne('sports', 0xd8546a, null);
      G.combat.registerTarget(state.stolenCar.mesh, 'car', state.stolenCar);
      state.stolenCar.pos.set(s.x, 0, s.z);
      state.stolenCar.heading = 0.4;
      state.stolenCar.mesh.rotation.y = 0.4;
      state.stolenCar.mode = 'parked';
    }
    if (s.type === 'escape') {
      G.police.setStars(4); G.police.setStarFloor(4);
      say([['LUCIA', 'They are coming, Nico. Drive like the tide is behind you!']]);
      G.hud.toast('LUCIA', 'Heat is on — reach the pier, do not stop.', 'warn');
    }
    setObjectiveForStep();
  }

  function completeStep() {
    const s = currentStep();
    if (s.type === 'escape') {
      const pay = state.active.pay;
      G.police.setStarFloor(0);
      finishJob();
      G.onEnding(pay);
      return;
    }
    state.stepIdx++;
    G.audio.gate();
    if (state.stepIdx >= state.active.steps.length) finishJob();
    else beginStep();
  }

  function finishJob() {
    const job = state.active;
    state.active = null;
    state.jobIndex++;
    G.cash += job.pay;
    G.audio.jobDone(); G.audio.cash();
    G.hud.jobCard('JOB COMPLETE', job.title, '+$' + job.pay + ' — Pilar pays in full');
    G.hud.toast('PILAR DUARTE', 'Clean work. Come see me at the plaza.', 'money');
    if (state.chaseCar) { state.chaseCar.mode = 'traffic'; }
    if (state.jobIndex >= JOBS.length) state.done = true;
    G.saveGame();
  }

  function spawnHostiles(step) {
    state.hostiles = [];
    for (let i = 0; i < step.count; i++) {
      const mesh = makePersonMesh(THREE, 0x8f2f3c, 0x1d2436, 0xd99e6a, 0x14141a);
      scene.add(mesh);
      const h = {
        mesh, pos: mesh.position, health: 42, dead: false,
        shootT: 1 + Math.random() * 1.5, phase: Math.random() * 6, heading: 0,
      };
      h.pos.set(step.x - 8 + i * 5.5, 0, step.z - 4 + (i % 2) * 7);
      state.hostiles.push(h);
      G.combat.registerTarget(mesh, 'hostile', h);
    }
    say([['NICO', 'Brisa car park. Four guns. Wonderful.']]);
  }

  G.onHostileHit = (h, dmg) => {
    if (h.dead) return;
    h.health -= dmg;
    G.police.addHeat(14, 'gunfight');
    if (h.health <= 0) {
      h.dead = true;
      h.mesh.rotation.x = -Math.PI / 2; h.mesh.position.y = 0.18;
      const left = state.hostiles.filter(x => !x.dead).length;
      G.hud.toast('BRISA CAR PARK', left > 0 ? left + ' hostile' + (left > 1 ? 's' : '') + ' still standing.' : 'Car park clear.');
    }
  };

  // ---- races ----
  function startRace(kind) {
    const defs = {
      boardwalk: { title: 'BOARDWALK RUN', gates: G.world.boardwalkGates, par: null, pay: 250, paySlow: 250 },
      vuelta: { title: 'GRAN VUELTA', gates: G.world.vueltaGates, par: 235, pay: 750, paySlow: 250 },
    };
    state.race = { ...defs[kind], idx: 0, t: 0, kind };
    G.hud.raceShow(defs[kind].title, 'Gate 1/' + defs[kind].gates.length + ' · 0:00');
    G.hud.toast('RACE', defs[kind].title + ' — follow the gold markers!', '');
    G.audio.gate();
  }
  function updateRace(dt) {
    const r = state.race;
    if (!r) return;
    if (!G.playerInCar()) { endRace(false, 'Race abandoned — you left the car.'); return; }
    r.t += dt;
    const gate = r.gates[r.idx];
    const p = G.playerPos();
    G.hud.raceShow(r.title, 'Gate ' + (r.idx + 1) + '/' + r.gates.length + ' · ' + G.hud.fmtTime(r.t) + (r.par ? ' · par ' + G.hud.fmtTime(r.par) : ''));
    if (Math.hypot(gate.x - p.x, gate.z - p.z) < 10) {
      r.idx++; G.audio.gate();
      if (r.idx >= r.gates.length) {
        const under = !r.par || r.t <= r.par;
        const pay = under ? r.pay : r.paySlow;
        G.cash += pay; G.audio.cash();
        endRace(true, r.title + ' finished in ' + G.hud.fmtTime(r.t) + ' — +' + '$' + pay);
        G.saveGame();
      }
    }
  }
  function endRace(won, msg) {
    state.race = null;
    G.hud.raceHide();
    G.hud.toast('RACE', msg, won ? 'money' : 'warn');
  }

  // ---- taxi fares ----
  function updateTaxi(dt) {
    state.taxiCd -= dt;
    const inTaxi = G.playerInCar() && G.playerCar().type === 'taxi';
    if (!state.taxi && inTaxi && state.taxiCd <= 0 && !state.active) {
      const spots = [[-76, 38], [76, -76], [0, 114], [152, 76], [-152, -114], [38, -190 + 24]];
      const pick = spots[Math.floor(Math.random() * spots.length)];
      state.taxi = { phase: 'pickup', x: pick[0], z: pick[1], fare: 0 };
      G.hud.toast('FARE', 'Passenger waiting — follow the marker.', '');
      G.hud.setObjective('Pick up your fare', pick[0], pick[1], 'TAXI');
    }
    if (!state.taxi) return;
    if (!inTaxi) { state.taxi = null; state.taxiCd = 15; if (!state.active) G.hud.setObjective(null); return; }
    const p = G.playerPos(), t = state.taxi;
    if (Math.hypot(t.x - p.x, t.z - p.z) < 8 && Math.abs(G.playerCar().speed) < 1.5) {
      if (t.phase === 'pickup') {
        const dests = [[190, 150], [-190, -150], [114, 60], [-60, 190 - 16], [0, -160]];
        const d = dests[Math.floor(Math.random() * dests.length)];
        t.phase = 'drop'; t.x = d[0]; t.z = d[1];
        t.fare = 42 + Math.hypot(d[0] - p.x, d[1] - p.z) * 0.4;
        G.hud.setObjective('Drop off your passenger', d[0], d[1], 'TAXI');
        G.audio.pickup();
      } else {
        G.cash += Math.round(t.fare); G.audio.cash();
        G.hud.toast('FARE PAID', '+$' + Math.round(t.fare) + ' — five stars, probably.', 'money');
        state.taxi = null; state.taxiCd = 18;
        if (!state.active) G.hud.setObjective(null);
        G.saveGame();
      }
    }
  }

  // ---- shops ----
  function nearestShop() {
    const p = G.playerPos();
    for (const s of G.world.shops) {
      if (Math.hypot(s.x - p.x, s.z - p.z) < 6 && !G.playerInCar()) return s;
    }
    return null;
  }
  function useShop(shop) {
    if (shop.id === 'CLINIC') {
      if (G.cash < 60) return G.hud.toast('CLINIC', 'Full treatment is $60. You are short.', 'warn');
      if (G.health >= 100) return G.hud.toast('CLINIC', 'You are already in perfect health.', '');
      G.cash -= 60; G.health = 100; G.audio.cash();
      G.hud.toast('COSTA CARE', 'Patched up. Health restored.', 'money');
    } else if (shop.id === 'THREADS') {
      if (G.cash < 40) return G.hud.toast('THREADS', 'A new outfit is $40. You are short.', 'warn');
      G.cash -= 40;
      G.progress.outfit = (G.progress.outfit + 1) % 4;
      const name = G.applyOutfit(G.progress.outfit);
      G.audio.cash();
      G.hud.toast('VERA THREADS', 'Now wearing: ' + name + '.', 'money');
    } else {
      if (G.cash < 15) return G.hud.toast('SNACKS', 'A snack is $15. You are short.', 'warn');
      if (G.health >= 100) return G.hud.toast('SNACKS', 'You are full. Save it for later.', '');
      G.cash -= 15; G.health = Math.min(100, G.health + 35); G.audio.cash();
      G.hud.toast('BOARDWALK SNACKS', 'Empanada down. +35 health.', 'money');
    }
    G.saveGame();
  }

  function update(dt, t) {
    // Pilar breathes and turns toward the player when close.
    const pp = G.playerPos();
    const pdist = Math.hypot(pp.x - PILAR_POS.x, pp.z - PILAR_POS.z);
    pilar.position.y = Math.sin(t * 1.8) * 0.02;
    if (pdist < 9) pilar.rotation.y = headingOf(pp.x - PILAR_POS.x, pp.z - PILAR_POS.z);

    // Dialogue queue.
    if (state.dlgQueue.length && state.dlgT <= 0) {
      const [name, text] = state.dlgQueue.shift();
      G.hud.dialogue(name, text, 3.6);
      state.dlgT = 3.7;
    }
    if (state.dlgT > 0) state.dlgT -= dt;

    // Marker follows the current goal.
    let mx = null, mz = null;
    const step = currentStep();
    if (state.race) { const g = state.race.gates[state.race.idx]; mx = g.x; mz = g.z; }
    else if (state.taxi) { mx = state.taxi.x; mz = state.taxi.z; }
    else if (step) {
      if (step.type === 'chase' && state.chaseCar) { mx = state.chaseCar.pos.x; mz = state.chaseCar.pos.z; }
      else { mx = step.x; mz = step.z; }
    } else if (!state.done) { mx = PILAR_POS.x; mz = PILAR_POS.z; }
    if (mx === null) marker.visible = false;
    else {
      marker.visible = true;
      marker.position.set(mx, 0, mz);
      gem.position.y = 3.1 + Math.sin(t * 2.4) * 0.35;
      gem.rotation.y = t * 1.8;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.07);
    }

    // Interact prompts and the E key.
    let promptHtml = null;
    if (!state.active && !state.done && pdist < 3.6 && !G.playerInCar()) {
      promptHtml = '<b>E</b> Talk to Pilar — new job';
      if (G.consumeInteract()) startJob(state.jobIndex);
    }
    const shop = nearestShop();
    if (shop && !promptHtml) {
      promptHtml = '<b>E</b> ' + shop.name + (shop.id === 'CLINIC' ? ' — heal $60' : shop.id === 'THREADS' ? ' — new outfit $40' : ' — snack $15');
      if (G.consumeInteract()) useShop(shop);
    }
    // Race start rings.
    if (!state.race && G.playerInCar() && !promptHtml) {
      if (Math.hypot(pp.x + 224, pp.z - 190) < 8) {
        promptHtml = '<b>E</b> Start BOARDWALK RUN — $250 prize';
        if (G.consumeInteract()) startRace('boardwalk');
      } else if (Math.hypot(pp.x + 228, pp.z - 114) < 8) {
        promptHtml = '<b>E</b> Start GRAN VUELTA — par 3:55, $750 prize';
        if (G.consumeInteract()) startRace('vuelta');
      }
    }
    G.hud.prompt(promptHtml);

    // Packages.
    for (const p of packages) {
      if (p.taken) continue;
      p.mesh.rotation.y = t * 2;
      p.mesh.position.y = 1.1 + Math.sin(t * 2.2 + p.i) * 0.22;
      if (Math.hypot(pp.x - p.x, pp.z - p.z) < 2.6) {
        p.taken = true; p.mesh.visible = false;
        G.progress.packages.push(p.i);
        G.cash += 75; G.audio.pickup();
        const left = packages.filter(x => !x.taken).length;
        G.hud.toast('HIDDEN PACKAGE', '+$75 — ' + (left === 0 ? 'all 15 found! Bonus $500.' : left + ' still hidden in Costa Vera.'), 'money');
        if (left === 0) G.cash += 500;
        G.saveGame();
      }
    }

    // Story step progression.
    if (step) {
      state.stepT += dt;
      if (step.type === 'goto' || step.type === 'dwell') {
        const d = Math.hypot(pp.x - step.x, pp.z - step.z);
        if (step.type === 'goto' && d < 7) {
          if (step.time && state.stepT > step.time) {
            G.hud.toast('PILAR DUARTE', 'Late. Half fee, and do not make it a habit.', 'warn');
            state.active.pay = Math.floor(state.active.pay / 2);
            step.time = null;
          }
          completeStep();
        } else if (step.type === 'dwell') {
          if (d < 6 && (!G.playerInCar() || Math.abs(G.playerCar().speed) < 1)) {
            if (state.stepT > 1.1) completeStep();
          }
        }
        if (step.time) {
          const left = Math.max(0, Math.ceil(step.time - state.stepT));
          G.hud.setObjective(step.label + ' — ' + left + 's left', step.x, step.z, 'JOB ' + (state.jobIndex + 1));
        }
      } else if (step.type === 'chase') {
        const car = state.chaseCar;
        const d = Math.hypot(pp.x - car.pos.x, pp.z - car.pos.z);
        if (d < 15) state.tailTime += dt;
        G.hud.setObjective(step.label + ' — tailed ' + Math.min(5, state.tailTime).toFixed(1) + '/5.0s', car.pos.x, car.pos.z, 'JOB ' + (state.jobIndex + 1));
        if (state.tailTime >= 5) {
          G.hud.toast('PILAR DUARTE', 'Good eyes. He stopped at the north alley.', '');
          completeStep();
        }
      } else if (step.type === 'shootout') {
        for (const h of state.hostiles) {
          if (h.dead) continue;
          const d = Math.hypot(h.pos.x - pp.x, h.pos.z - pp.z);
          h.heading = headingOf(pp.x - h.pos.x, pp.z - h.pos.z);
          h.mesh.rotation.y = h.heading;
          if (d > 16) {
            h.pos.x += Math.sin(h.heading) * 2.4 * dt;
            h.pos.z += Math.cos(h.heading) * 2.4 * dt;
          }
          h.shootT -= dt;
          if (h.shootT <= 0 && d < 30) {
            h.shootT = 1.3 + Math.random() * 1.1;
            const from = h.pos.clone(); from.y += 1.35;
            const to = pp.clone(); to.y += 1.1;
            G.effects.tracer(from, to); G.effects.muzzle(from);
            G.audio.distantShot();
            if (Math.random() < clamp(0.5 - d * 0.01, 0.08, 0.4)) G.damagePlayer(4 + Math.random() * 4);
          }
        }
        if (state.hostiles.length && state.hostiles.every(h => h.dead)) completeStep();
      } else if (step.type === 'steal') {
        if (G.playerInCar() && G.playerCar() === state.stolenCar) {
          G.police.addHeat(60, 'grand theft auto');
          completeStep();
        }
      } else if (step.type === 'escape') {
        const d = Math.hypot(pp.x - step.x, pp.z - step.z);
        if (d < 8 && G.playerInCar()) completeStep();
      }
    } else if (!state.done && !state.race && !state.taxi) {
      G.hud.setObjective(state.jobIndex === 0 ? 'Meet Pilar Duarte at the fountain plaza' : 'Return to Pilar at the fountain plaza', PILAR_POS.x, PILAR_POS.z, 'STORY');
    } else if (state.done && !state.race && !state.taxi) {
      G.hud.setObjective('Golden Hour complete — Costa Vera is yours to roam', null, null, 'FREE ROAM');
    }

    updateRace(dt);
    updateTaxi(dt);
  }

  // Continue restores where the story left off: job index and the packages
  // already pocketed (their meshes hide again).
  function applyProgress(progress) {
    state.jobIndex = progress.jobIndex;
    state.done = progress.jobIndex >= JOBS.length;
    for (const p of packages) {
      p.taken = progress.packages.includes(p.i);
      p.mesh.visible = !p.taken;
    }
  }

  return {
    update, state, applyProgress,
    jobCount: JOBS.length,
    remainingPackages: () => packages.filter(p => !p.taken),
    startRace, // exposed for testing
  };
}
