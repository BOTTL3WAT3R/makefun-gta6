// save.js — the pause-menu save. One slot in localStorage holding the
// state Continue needs: wallet, story progress, packages, health, armour
// and exactly where the player was standing.

const SAVE_KEY = 'golden-hour-costa-vera-v1';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return false;
  }
}

export function saveGame(G) {
  const data = {
    version: 1,
    cash: G.player.cash,
    nextJob: G.job.nextIndex,
    storyDone: G.storyDone,
    packages: G.activities.packages.map((p) => p.taken),
    packagesFound: G.activities.packagesFound,
    health: G.player.health,
    armor: G.player.armor,
    x: G.player.x,
    z: G.player.z,
    heading: G.player.heading,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // A corrupt or foreign-version save is no save at all: Continue falls
    // back to a fresh game instead of applying nonsense field by field.
    if (!data || typeof data !== 'object' || data.version !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function applySave(G, data) {
  if (!data) return false;
  G.player.cash = data.cash ?? G.player.cash;
  G.player.health = data.health ?? 100;
  G.player.armor = data.armor ?? 0;
  G.job.nextIndex = data.nextJob ?? 0;
  G.storyDone = !!data.storyDone;
  if (Array.isArray(data.packages)) {
    data.packages.forEach((taken, i) => {
      const p = G.activities.packages[i];
      if (p && taken) {
        p.taken = true;
        p.mesh.visible = false;
      }
    });
    G.activities.packagesFound = data.packagesFound ?? data.packages.filter(Boolean).length;
  }
  if (typeof data.x === 'number' && typeof data.z === 'number') {
    G.player.x = data.x;
    G.player.z = data.z;
    G.player.heading = data.heading ?? G.player.heading;
    G.player.group.position.set(data.x, 0, data.z);
    G.player.group.rotation.y = G.player.heading;
  }
  return true;
}
