// radio.js — all of Costa Vera's sound, synthesized live with WebAudio:
// four radio stations that play while you drive, and the little effects
// (gunshots, coins, thuds, blips) the world makes. No audio files at all.

const STATIONS = [
  {
    name: 'Sol FM · 101.3',
    bpm: 116, wave: 'triangle', gain: 0.16,
    // A sunny major arpeggio, two bars of eight steps.
    notes: [0, 4, 7, 11, 12, 11, 7, 4, 0, 4, 7, 11, 12, 16, 12, 7],
    base: 262, bassEvery: 4, bassNotes: [0, -5, -8, -5],
  },
  {
    name: 'Marea Wave · 94.7',
    bpm: 72, wave: 'sine', gain: 0.2,
    // Slow minor chords washing in and out.
    notes: [0, 3, 7, 3, -2, 2, 5, 2, 0, 3, 7, 3, 5, 3, 2, -2],
    base: 220, bassEvery: 8, bassNotes: [0, -4],
  },
  {
    name: 'Neón Nights · 88.1',
    bpm: 124, wave: 'square', gain: 0.07,
    // A driving synthwave bassline with a sparkle on top.
    notes: [0, 0, 12, 0, 3, 0, 10, 0, 0, 0, 12, 0, 15, 12, 10, 3],
    base: 131, bassEvery: 2, bassNotes: [0, 0, -4, -2],
  },
  {
    name: 'Radio Alba · Talk',
    bpm: 96, wave: 'square', gain: 0.05,
    // Newsroom blips and weather-report warbles.
    notes: [7, -99, 7, -99, 5, -99, -99, 9, -99, 7, -99, 4, -99, -99, 2, -99],
    base: 392, bassEvery: 16, bassNotes: [0],
  },
];

export function stationName(index) {
  return STATIONS[index].name;
}

export const STATION_COUNT = STATIONS.length;

export function createRadio(G) {
  const radio = {
    ctx: null,
    master: null,
    station: 0,
    step: 0,
    nextStepAt: 0,
    ensure() {
      if (radio.ctx) {
        if (radio.ctx.state === 'suspended') radio.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      radio.ctx = new AC();
      radio.master = radio.ctx.createGain();
      radio.master.gain.value = 0.9;
      radio.master.connect(radio.ctx.destination);
    },
    tone(freq, at, dur, wave, gain, dest) {
      const ctx = radio.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g);
      g.connect(dest || radio.master);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    },
    noise(at, dur, gain, freq) {
      const ctx = radio.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filter);
      filter.connect(g);
      g.connect(radio.master);
      src.start(at);
    },
  };

  // One-shot effects, safe to call before the context exists (they no-op).
  G.sfx = {
    shot(far = false) {
      if (!radio.ctx) return;
      radio.noise(radio.ctx.currentTime, far ? 0.1 : 0.16, far ? 0.12 : 0.3, far ? 900 : 1500);
    },
    thud() {
      if (!radio.ctx) return;
      radio.tone(70, radio.ctx.currentTime, 0.18, 'sine', 0.4);
    },
    cash() {
      if (!radio.ctx) return;
      const t = radio.ctx.currentTime;
      radio.tone(1320, t, 0.09, 'triangle', 0.22);
      radio.tone(1760, t + 0.07, 0.14, 'triangle', 0.22);
    },
    blip() {
      if (!radio.ctx) return;
      radio.tone(880, radio.ctx.currentTime, 0.07, 'triangle', 0.18);
    },
  };
  return radio;
}

function semitone(base, semis) {
  return base * Math.pow(2, semis / 12);
}

// Called every frame: keeps the current station's sequencer fed while the
// player is in a car, and unlocks audio on the first input gesture.
export function updateRadio(G, dt) {
  const radio = G.radio;
  if (!radio.ctx && G.inputSeen) radio.ensure();
  if (!radio.ctx) return;
  const driving = G.mode === 'playing' && G.player.inVehicle;
  if (!driving) return;

  const st = STATIONS[radio.station];
  const stepDur = 60 / st.bpm / 2; // eighth notes
  const now = radio.ctx.currentTime;
  if (radio.nextStepAt < now) {
    radio.nextStepAt = now + 0.05;
    radio.step = 0;
  }
  while (radio.nextStepAt < now + 0.18) {
    const i = radio.step % st.notes.length;
    const note = st.notes[i];
    if (note > -90) radio.tone(semitone(st.base, note), radio.nextStepAt, stepDur * 1.6, st.wave, st.gain);
    if (i % st.bassEvery === 0) {
      const bass = st.bassNotes[Math.floor(i / st.bassEvery) % st.bassNotes.length];
      radio.tone(semitone(st.base / 2, bass), radio.nextStepAt, stepDur * st.bassEvery * 0.9, 'sine', 0.22);
    }
    radio.nextStepAt += stepDur;
    radio.step++;
  }
}

export function nextStation(G) {
  const radio = G.radio;
  radio.station = (radio.station + 1) % STATIONS.length;
  radio.step = 0;
  radio.nextStepAt = 0;
  G.radioDisplay = { text: '📻 ' + STATIONS[radio.station].name, until: G.elapsed + 2.2 };
  if (G.sfx) G.sfx.blip();
}
