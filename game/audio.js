// audio.js — every sound in Costa Vera is synthesised with WebAudio at run
// time: four radio stations with their own little step-sequenced loops, an
// engine hum that follows the throttle, police sirens, gunfire and UI blips.
// No audio files, so the game never touches the network.

const STATIONS = [
  { name: 'Sol FM', base: 220.0, scale: [0, 2, 4, 7, 9], tempo: 112, wave: 'triangle', bass: 0.5 },
  { name: 'Brisa Wave', base: 196.0, scale: [0, 3, 5, 7, 10], tempo: 84, wave: 'sine', bass: 0.35 },
  { name: 'Radio Marea', base: 246.9, scale: [0, 2, 3, 7, 8], tempo: 126, wave: 'square', bass: 0.6 },
  { name: 'Noche 104', base: 174.6, scale: [0, 3, 5, 8, 10], tempo: 100, wave: 'sawtooth', bass: 0.45 },
];

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.station = 0;
    this.radioOn = false;
    this.step = 0;
    this.nextNoteAt = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.master = null;
  }

  // Must be called from a user gesture at least once.
  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.ready = true;
    this.startEngine();
  }

  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // rpm 0..1, active only while the player drives.
  engine(rpm, driving) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + rpm * 130, t, 0.06);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + rpm * 0.05 : 0, t, 0.1);
  }

  setSiren(on) {
    if (!this.ready) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.016;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.65;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 760;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
    }
  }

  tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  shot() {
    this.noise(0.14, 0.5, 900);
    this.tone(150, 0.1, 'square', 0.25, 0, 40);
  }

  dryFire() {
    this.tone(1200, 0.03, 'square', 0.08);
  }

  pickup() {
    this.tone(660, 0.09, 'sine', 0.2);
    this.tone(990, 0.14, 'sine', 0.2, 0.07);
  }

  cash() {
    this.tone(880, 0.08, 'triangle', 0.22);
    this.tone(1174, 0.1, 'triangle', 0.22, 0.06);
    this.tone(1568, 0.16, 'triangle', 0.2, 0.12);
  }

  hurt() {
    this.tone(110, 0.18, 'sawtooth', 0.25, 0, 55);
  }

  gate() {
    this.tone(523, 0.1, 'sine', 0.18);
    this.tone(784, 0.16, 'sine', 0.18, 0.08);
  }

  stationName() {
    return STATIONS[this.station].name;
  }

  cycleStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.step = 0;
    return STATIONS[this.station].name;
  }

  setRadio(on) {
    this.radioOn = on;
    if (on && this.ready) this.nextNoteAt = this.ctx.currentTime + 0.05;
  }

  // Called every frame; schedules the current station's loop a step ahead.
  update() {
    if (!this.ready || !this.radioOn) return;
    const st = STATIONS[this.station];
    const spb = 60 / st.tempo / 2; // eighth notes
    while (this.nextNoteAt < this.ctx.currentTime + 0.12) {
      const when = Math.max(0, this.nextNoteAt - this.ctx.currentTime);
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const chord = [0, 3, 4, 1][bar];
      if (s % 4 === 0) {
        const root = st.base * Math.pow(2, st.scale[chord] / 12) / 2;
        this.tone(root, spb * 3.5, 'triangle', 0.16 * st.bass + 0.08, when);
      }
      if (s % 2 === 0) {
        const deg = st.scale[(chord + (s / 2) % 3) % st.scale.length];
        const f = st.base * Math.pow(2, deg / 12) * (s % 8 === 6 ? 2 : 1);
        this.tone(f, spb * 0.9, st.wave, 0.055, when);
      }
      if (s % 4 === 2) this.noiseAt(0.03, 0.03, 6000, when);
      this.nextNoteAt += spb;
      this.step++;
    }
  }

  noiseAt(dur, vol, freq, when) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }
}
