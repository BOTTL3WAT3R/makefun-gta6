// audio.js — every sound in Costa Vera is synthesised with WebAudio: four
// procedural radio stations, an engine hum that follows the car, sirens,
// gunfire, ocean ambience and the helicopter's rotor. No audio files exist.

const STATIONS = [
  { name: 'SOLSTICE FM', tag: 'sunset house', scale: [0, 3, 5, 7, 10], base: 196.0, tempo: 0.24, wave: 'sawtooth', bright: 900 },
  { name: 'FARO NOCTURNA', tag: 'night drive synth', scale: [0, 2, 3, 7, 9], base: 146.83, tempo: 0.30, wave: 'square', bright: 620 },
  { name: 'RADIO BRISA', tag: 'coastal grooves', scale: [0, 2, 4, 7, 9], base: 174.61, tempo: 0.27, wave: 'triangle', bright: 1200 },
  { name: 'VERA TALK 98', tag: 'city news & static', scale: [0, 5, 7, 12], base: 110.0, tempo: 0.42, wave: 'sine', bright: 480 },
];

export function createAudio() {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenLfo = null;
  let rotorGain = null, rotorTimer = null;
  let stationIdx = -1, radioGain = null, radioStep = 0, radioTimer = null, noiseBuf = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return false; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    // A shared noise buffer feeds gunshots, surf and the rotor.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    startAmbience();
    return true;
  }

  function noiseSource() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  // Ocean surf and evening wind: slow-filtered noise, always under everything.
  function startAmbience() {
    const src = noiseSource();
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.028;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(); lfo.start();
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq, when) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const s = noiseSource(); s.loop = false;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }

  // ---- radio: a tiny step sequencer; each station is a scale + timbre ----
  function scheduleRadioStep() {
    if (!ctx || stationIdx < 0) return;
    const st = STATIONS[stationIdx];
    const step = radioStep++;
    const bar = Math.floor(step / 8), beat = step % 8;
    // Bass on the beat, a wandering arp above it, a soft hat of noise.
    if (beat % 2 === 0) {
      const deg = st.scale[(bar + beat / 2) % st.scale.length];
      tone(st.base / 2 * Math.pow(2, deg / 12), st.tempo * 1.8, 'sine', 0.16, 0);
    }
    const arpDeg = st.scale[(step * 3 + bar) % st.scale.length];
    const arpFreq = st.base * Math.pow(2, (arpDeg + 12) / 12);
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = st.wave; o.frequency.value = arpFreq;
    f.type = 'lowpass'; f.frequency.value = st.bright;
    g.gain.setValueAtTime(0.055, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + st.tempo * 0.95);
    o.connect(f); f.connect(g); g.connect(radioGain);
    o.start(); o.stop(ctx.currentTime + st.tempo);
    if (beat % 2 === 1) noiseBurst(0.03, 0.012, 6000, 0);
  }

  function setStation(idx) {
    if (!ensure()) return null;
    stationIdx = idx;
    if (radioTimer) { clearInterval(radioTimer); radioTimer = null; }
    if (!radioGain) { radioGain = ctx.createGain(); radioGain.gain.value = 0.9; radioGain.connect(master); }
    if (idx >= 0) {
      radioStep = 0;
      const st = STATIONS[idx];
      scheduleRadioStep();
      radioTimer = setInterval(scheduleRadioStep, st.tempo * 1000);
      return st;
    }
    return null;
  }

  function cycleStation() {
    const next = (stationIdx + 1) % (STATIONS.length + 1); // last stop = off
    const st = setStation(next > STATIONS.length - 1 ? -1 : next);
    return st ? { ...st, index: next } : null;
  }

  // ---- continuous voices: engine, siren, rotor ----
  function setEngine(on, throttle, speedRatio) {
    if (!ctx) return;
    if (on && !engineOsc) {
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    }
    if (!on && engineOsc) {
      try { engineOsc.stop(); } catch (e) {}
      engineOsc.disconnect(); engineOsc = null; engineGain = null; return;
    }
    if (engineOsc) {
      engineOsc.frequency.value = 55 + speedRatio * 165 + throttle * 22;
      engineGain.gain.value = 0.028 + speedRatio * 0.03;
    }
  }

  function setSiren(on, level) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 800;
      sirenLfo = ctx.createOscillator(); sirenLfo.frequency.value = 0.55;
      const lg = ctx.createGain(); lg.gain.value = 190;
      sirenLfo.connect(lg); lg.connect(sirenOsc.frequency);
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start(); sirenLfo.start();
    }
    if (!on && sirenOsc) {
      try { sirenOsc.stop(); sirenLfo.stop(); } catch (e) {}
      sirenOsc.disconnect(); sirenOsc = null; sirenGain = null; return;
    }
    if (sirenGain) sirenGain.gain.value = 0.012 + level * 0.05;
  }

  function setRotor(on) {
    if (!ctx) return;
    if (on && !rotorTimer) {
      rotorGain = ctx.createGain(); rotorGain.gain.value = 0.0; rotorGain.connect(master);
      const pulse = () => noiseBurst(0.05, 0.05, 300, 0);
      pulse();
      rotorTimer = setInterval(pulse, 130);
      rotorGain.gain.value = 1;
    }
    if (!on && rotorTimer) { clearInterval(rotorTimer); rotorTimer = null; }
  }

  return {
    unlock: ensure,
    setStation, cycleStation,
    setEngine, setSiren, setRotor,
    stationCount: STATIONS.length,
    stationName: i => STATIONS[i],
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    isMuted: () => muted,
    gunshot() { noiseBurst(0.16, 0.32, 900); tone(120, 0.1, 'square', 0.1, 0, 40); },
    distantShot() { noiseBurst(0.12, 0.1, 500); },
    hit() { noiseBurst(0.07, 0.16, 2000); },
    pickup() { tone(880, 0.09, 'sine', 0.14); tone(1318, 0.14, 'sine', 0.12, 0.07); },
    cash() { tone(1046, 0.07, 'square', 0.08); tone(1568, 0.12, 'square', 0.08, 0.06); },
    uiClick() { tone(660, 0.05, 'sine', 0.08); },
    doorSlam() { noiseBurst(0.08, 0.2, 240); },
    crash(intensity) { noiseBurst(0.22, Math.min(0.4, 0.12 + intensity * 0.3), 300); },
    gate() { tone(523, 0.09, 'sine', 0.12); tone(784, 0.16, 'sine', 0.12, 0.08); },
    jobDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.09)); },
    alarm() { tone(1180, 0.12, 'square', 0.07); tone(1180, 0.12, 'square', 0.07, 0.16); },
  };
}
