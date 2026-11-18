// audio.js — every sound in Golden Hour is synthesized with WebAudio: three
// procedural radio stations (a tiny step sequencer), an engine voice tied
// to the player's car, a two-tone police siren, the helicopter's rotor
// wash, a soft sea-breeze ambience bed, and one-shot effects.

const STATIONS = [
  { name: 'ONDA 98 — chill', bpm: 76, wave: 'triangle',
    bass: [0, -1, -1, 0, -1, -1, 3, -1], lead: [7, -1, 10, -1, 12, -1, 10, 7, 5, -1, 7, -1, 3, -1, -1, -1], root: 110 },
  { name: 'RADIO PULSO — drive', bpm: 122, wave: 'sawtooth',
    bass: [0, 0, -1, 0, 0, -1, 0, 5], lead: [12, -1, 12, 15, -1, 12, -1, 10, 12, -1, 12, 15, 17, -1, 15, 12], root: 98 },
  { name: 'SOL FM — golden', bpm: 96, wave: 'square',
    bass: [0, -1, 4, -1, 5, -1, 4, -1], lead: [16, -1, -1, 14, -1, 12, -1, -1, 9, -1, 12, -1, 14, -1, -1, -1], root: 130.81 },
  { name: 'FARO NOCTURNA — synth', bpm: 104, wave: 'sawtooth',
    bass: [0, -1, -1, 7, -1, -1, 5, -1], lead: [19, -1, 17, -1, 16, -1, 14, -1, 12, -1, 14, -1, 16, -1, -1, -1], root: 87.31 },
];
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // minor scale steps for lead lines
const noteHz = (root, steps) => root * Math.pow(2, steps / 12);
const leadHz = (root, deg) => noteHz(root * 2, SCALE[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7));

export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.station = 0;
    this.radioOn = false; this.seqStep = 0; this.nextStepAt = 0;
    this.heliLevel = 0;
  }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    // Engine voice: detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter); this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
    // Siren voice: square blip alternating pitch, gain set by nearest police.
    this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'square'; this.sirenOsc.frequency.value = 760;
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenFlip = 0;
    // Reusable noise buffer for shots, crashes and surf-like hits.
    const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // Sea-breeze ambience: looped noise through a slow-breathing lowpass.
    const sea = ctx.createBufferSource(); sea.buffer = buf; sea.loop = true;
    this.seaFilter = ctx.createBiquadFilter(); this.seaFilter.type = 'lowpass'; this.seaFilter.frequency.value = 420;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.016;
    sea.connect(this.seaFilter); this.seaFilter.connect(this.seaGain); this.seaGain.connect(this.master);
    sea.start();
    // Helicopter rotor: a chopping amplitude gate over brown-ish noise.
    const rotor = ctx.createBufferSource(); rotor.buffer = buf; rotor.loop = true; rotor.playbackRate.value = 0.4;
    const rotorFilter = ctx.createBiquadFilter(); rotorFilter.type = 'bandpass'; rotorFilter.frequency.value = 300; rotorFilter.Q.value = 0.7;
    this.rotorGain = ctx.createGain(); this.rotorGain.gain.value = 0;
    this.rotorChop = ctx.createGain(); this.rotorChop.gain.value = 0.6;
    const chopOsc = ctx.createOscillator(); chopOsc.type = 'square'; chopOsc.frequency.value = 11;
    const chopDepth = ctx.createGain(); chopDepth.gain.value = 0.4;
    chopOsc.connect(chopDepth); chopDepth.connect(this.rotorChop.gain);
    rotor.connect(rotorFilter); rotorFilter.connect(this.rotorChop); this.rotorChop.connect(this.rotorGain);
    this.rotorGain.connect(this.master);
    rotor.start(); chopOsc.start();
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; }
  stationName() { return STATIONS[this.station].name; }
  nextStation() { this.station = (this.station + 1) % STATIONS.length; this.seqStep = 0; return this.stationName(); }
  setRadio(on) { this.radioOn = on; if (on) this.nextStepAt = this.ctx ? this.ctx.currentTime + 0.05 : 0; }
  setEngine(on, speedRatio, rpmLoad) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + rpmLoad * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 52 + speedRatio * 165 + rpmLoad * 26;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.1);
  }
  setSirenLevel(level) { // level 0..1 by police proximity
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(level * 0.028, this.ctx.currentTime, 0.15);
  }
  setHeliLevel(level) { // 0..1 by helicopter presence/distance
    this.heliLevel = level;
    if (!this.ctx) return;
    this.rotorGain.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.25);
  }
  update(dt) {
    if (!this.ctx) return;
    this.sirenFlip += dt;
    if (this.sirenFlip > 0.42) { this.sirenFlip = 0; this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 690 : 955; }
    // the breeze breathes on a slow cycle
    this.seaFilter.frequency.value = 380 + Math.sin(this.ctx.currentTime * 0.13) * 130;
    if (!this.radioOn || this.muted) return;
    const st = STATIONS[this.station], spb = 60 / st.bpm / 2; // eighth notes
    while (this.nextStepAt < this.ctx.currentTime + 0.12) {
      this.playStep(st, this.seqStep, Math.max(this.nextStepAt, this.ctx.currentTime));
      this.seqStep = (this.seqStep + 1) % 16; this.nextStepAt += spb;
    }
  }
  playStep(st, step, t) {
    const ctx = this.ctx;
    const b = st.bass[step % st.bass.length];
    if (b >= 0) this.tone(noteHz(st.root, b), t, 0.16, 'triangle', 0.16);
    const l = st.lead[step % st.lead.length];
    if (l >= 0) this.tone(leadHz(st.root, l), t, 0.13, st.wave, 0.045);
    if (step % 4 === 0) this.hat(t, 0.03); if (step % 8 === 4) this.hat(t, 0.06);
  }
  tone(freq, t, dur, type, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  hat(t, vol) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 0.07);
  }
  noise(dur, vol, freq) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02);
  }
  blip(freq, dur, vol, type = 'sine') { if (this.ctx) this.tone(freq, this.ctx.currentTime, dur, type, vol); }
  shot() { this.noise(0.14, 0.5, 2600); this.blip(160, 0.09, 0.3, 'square'); }
  dryShot() { this.noise(0.05, 0.2, 3200); }
  crash(big) { this.noise(big ? 0.4 : 0.2, big ? 0.55 : 0.3, 480); }
  pickup() { this.blip(880, 0.09, 0.16); setTimeout(() => this.blip(1318, 0.14, 0.16), 70); }
  cash() { this.blip(1568, 0.07, 0.14); setTimeout(() => this.blip(2093, 0.12, 0.14), 60); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 0.15, 'triangle'), i * 85)); }
  fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 0.15, 'triangle'), i * 110)); }
  door() { this.noise(0.06, 0.18, 900); }
  step() { this.noise(0.03, 0.05, 700); }
}
