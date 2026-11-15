// SOLARIS — procedural audio: every sound is synthesized with WebAudio, no assets.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.muted = false;
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  _noise(dur, filterFreq, type = 'lowpass') {
    if (!this.ctx) return null;
    const len = Math.max(1, (dur * this.ctx.sampleRate) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(this.master);
    return { src, g };
  }
  _tone(freq, dur, type = 'sine', vol = 0.5, slide = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), this.ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  shot(kind, dist = 0) {
    if (!this.ctx || this.muted) return;
    const vol = Math.max(0.12, 1 - dist / 70);
    const n = this._noise(kind === 'sniper' ? 0.28 : kind === 'shotgun' ? 0.24 : 0.11, kind === 'smg' ? 2400 : 1500);
    if (!n) return;
    n.g.gain.value = vol * (kind === 'sniper' ? 1 : kind === 'shotgun' ? 0.95 : 0.7);
    n.src.start();
    this._tone(kind === 'sniper' ? 140 : 90, 0.12, 'sine', vol * 0.7, -50);
  }
  dry() { this._tone(1400, 0.04, 'square', 0.12); }
  reload() {
    this._tone(900, 0.05, 'square', 0.14);
    setTimeout(() => this._tone(650, 0.05, 'square', 0.14), 260);
    setTimeout(() => this._tone(1100, 0.05, 'square', 0.16), 520);
  }
  hit(head) { this._tone(head ? 2400 : 1800, 0.06, 'square', 0.2); }
  kill() { this._tone(520, 0.1, 'sine', 0.3, 260); setTimeout(() => this._tone(780, 0.12, 'sine', 0.25), 90); }
  hurt() { this._tone(220, 0.14, 'sawtooth', 0.2, -90); }
  step(run) {
    const n = this._noise(0.06, 500); if (!n) return;
    n.g.gain.value = run ? 0.1 : 0.06; n.src.start();
  }
  plantBeep(final) { this._tone(final ? 1500 : 1050, final ? 0.3 : 0.09, 'square', 0.22); }
  defuseBeep() { this._tone(1300, 0.07, 'square', 0.18); }
  explosion(dist = 0) {
    if (!this.ctx || this.muted) return;
    const vol = Math.max(0.15, 1 - dist / 60);
    const n = this._noise(0.7, 320); if (!n) return;
    n.g.gain.value = vol; n.src.start();
    this._tone(55, 0.6, 'sine', vol * 0.9, -25);
  }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'sine', 0.28), i * 130)); }
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'sine', 0.24), i * 140)); }
  buy() { this._tone(880, 0.07, 'sine', 0.2); setTimeout(() => this._tone(1174, 0.09, 'sine', 0.2), 70); }
  click() { this._tone(700, 0.04, 'square', 0.1); }
}
