// jobs.js — the story director. Pilar Duarte hands out seven jobs, one at a
// time; this module runs the dialogue, the objective marker, the title
// cards, payouts and failure, while each job's own file runs its stages.

import * as THREE from '../three.module.min.js';
import { PLACES } from './config.js';
import { formatCash } from './util.js';
import { playerPos } from './player.js';
import { setHeatFloor } from './police.js';
import jobPier from './job1-pier.js';
import jobTimed from './job2-timed.js';
import jobChase from './job3-chase.js';
import jobShootout from './job4-shootout.js';
import jobGetaway from './job5-getaway.js';
import jobTheft from './job6-theft.js';
import jobFinale from './job7-finale.js';

export const JOBS = [jobPier, jobTimed, jobChase, jobShootout, jobGetaway, jobTheft, jobFinale];

export function createJobState() {
  return {
    nextIndex: 0, // the job Pilar will offer next
    active: null, // { def, data } while a job is running
    objective: null, // { x, z, label }
    timer: null, // seconds left, for timed stages (read by the HUD)
    dialogue: null, // { lines, index, timer, onDone }
    card: null, // { title, subtitle, until }
  };
}

// --- Objective marker: a gold beam of light you can see across the city ------

let markerGroup = null;

export function initMarker(G) {
  markerGroup = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffca3a, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 21;
  markerGroup.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffca3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  markerGroup.add(ring);
  markerGroup.visible = false;
  G.scene.add(markerGroup);
}

export function setObjective(G, x, z, label) {
  G.job.objective = { x, z, label };
}

export function clearObjective(G) {
  G.job.objective = null;
  G.job.timer = null;
}

// --- Dialogue and cards ---------------------------------------------------------

export function say(G, lines, onDone = null) {
  G.job.dialogue = { lines, index: 0, timer: 0, onDone };
}

export function currentLine(G) {
  const d = G.job.dialogue;
  if (!d) return null;
  return d.lines[d.index];
}

export function advanceDialogue(G) {
  const d = G.job.dialogue;
  if (!d) return;
  d.index++;
  d.timer = 0;
  if (d.index >= d.lines.length) {
    G.job.dialogue = null;
    if (d.onDone) d.onDone();
  }
}

export function showCard(G, title, subtitle, seconds = 3.4) {
  G.job.card = { title, subtitle, until: G.elapsed + seconds };
}

// --- The flow ----------------------------------------------------------------------

export function talkToPilar(G) {
  const J = G.job;
  if (J.dialogue) {
    advanceDialogue(G);
    return;
  }
  if (J.active) {
    say(G, [['Pilar', 'Finish what you started, then we talk.']]);
    return;
  }
  if (J.nextIndex >= JOBS.length) {
    say(G, [
      ['Pilar', 'The tide went out and you are still standing. Costa Vera is yours now.'],
      ['Pilar', 'Races, fares, packages — the city still pays those who hustle.'],
    ]);
    return;
  }
  const def = JOBS[J.nextIndex];
  showCard(G, def.title, def.subtitle);
  say(G, def.intro, () => {
    J.active = { def, data: {} };
    def.start(G);
  });
}

export function completeJob(G) {
  const J = G.job;
  const { def, data } = J.active;
  const payout = def.payout + (data.bonus || 0);
  G.player.cash += payout;
  if (G.sfx) G.sfx.cash();
  showCard(G, 'JOB COMPLETE', def.title + ' · +' + formatCash(payout));
  if (def.cleanup) def.cleanup(G);
  J.active = null;
  J.nextIndex++;
  clearObjective(G);
  if (J.nextIndex >= JOBS.length && !G.storyDone) {
    G.storyDone = true;
    G.onStoryComplete();
  }
}

export function failJob(G, reason) {
  const J = G.job;
  if (!J.active) return;
  if (J.active.def.cleanup) J.active.def.cleanup(G);
  J.active = null;
  setHeatFloor(G, 0);
  clearObjective(G);
  G.toast('Job failed: ' + reason + ' — see Pilar to try again.');
}

export function updateJobs(G, dt) {
  const J = G.job;
  // Dialogue auto-advances if the player just listens.
  if (J.dialogue) {
    J.dialogue.timer += dt;
    if (J.dialogue.timer > 4.6) advanceDialogue(G);
  }
  // Marker placement and pulse.
  if (markerGroup) {
    if (J.objective) {
      markerGroup.visible = true;
      markerGroup.position.set(J.objective.x, 0, J.objective.z);
      const s = 1 + Math.sin(G.elapsed * 3.2) * 0.08;
      markerGroup.scale.set(s, 1, s);
    } else {
      markerGroup.visible = false;
    }
  }
  if (J.active) {
    const result = J.active.def.update(G, dt);
    if (result === true) completeJob(G);
    else if (result === 'fail') failJob(G, J.active.data.failReason || 'it fell apart.');
  }
}

export function activeJobTitle(G) {
  return G.job.active ? G.job.active.def.title : null;
}

// Distance from the player (or their car) to a point.
export function nearObjective(G, x, z, radius) {
  const pp = playerPos(G.player);
  return Math.hypot(pp.x - x, pp.z - z) < radius;
}

export function pilarDistance(G) {
  const pp = playerPos(G.player);
  return Math.hypot(pp.x - PLACES.pilarCorner.x, pp.z - PLACES.pilarCorner.z);
}
