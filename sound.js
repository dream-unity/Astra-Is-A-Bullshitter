export class MuseumSound {
  constructor() { this.enabled = false; this.ctx = null; this.clock = 0; this.beat = 0; this.steps = 0; }
  async unlock() {
    try {
      if (!this.ctx) { const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return false; this.ctx = new Context(); this.master = this.ctx.createGain(); this.master.gain.value = 0; const compressor = this.ctx.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.ratio.value = 5; this.master.connect(compressor); compressor.connect(this.ctx.destination); this.delay = this.ctx.createDelay(1); this.delay.delayTime.value = .28; const wet = this.ctx.createGain(); wet.gain.value = .12; this.delay.connect(wet); wet.connect(this.master); }
      if (this.ctx.state === 'suspended') await this.ctx.resume(); return true;
    } catch { return false; }
  }
  async toggle() { if (!await this.unlock()) return false; this.enabled = !this.enabled; this.master.gain.setTargetAtTime(this.enabled ? .5 : 0, this.ctx.currentTime, .08); return this.enabled; }
  note(frequency, duration = .5, volume = .1, type = 'sine', delay = 0, end = null) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + delay, osc = this.ctx.createOscillator(), gain = this.ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(frequency, t); if (end) osc.frequency.exponentialRampToValueAtTime(end, t + duration);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + duration); osc.connect(gain); gain.connect(this.master); gain.connect(this.delay); osc.start(t); osc.stop(t + duration + .02); osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
  event(e) {
    if (e.type === 'take') { this.note(740, .2, .09, 'triangle', 0, 180); this.note(174, .6, .1); }
    if (e.type === 'give' || e.type === 'exchange') { this.note(174, .16, .07, 'triangle', 0, 740); this.note(440, .5, .1, 'sine', .07); this.note(660, .5, .05, 'sine', .12); }
    if (e.type === 'alarm') { this.note(186, .24, .1, 'triangle'); this.note(139, .4, .09, 'triangle', .14); }
    if (e.type === 'fall') this.note(290, .5, .04, 'sine', 0, 72);
    if (e.type === 'complete' || e.type === 'note') [0, 5, 9, 12].forEach((n, i) => this.note(220 * 2 ** (n / 12), .7, .08, 'sine', i * .08));
    if (e.type === 'sun-stolen') this.note(55, 2.5, .12, 'sine', 0, 27.5);
    if (e.type === 'freedom') [0, 4, 7, 11, 12, 16, 19, 24].forEach((n, i) => this.note(220 * 2 ** (n / 12), 2.7, .08, 'sine', i * .22));
  }
  tick(dt, game) {
    if (!this.enabled || game.state !== 'playing') return;
    this.steps -= dt; if (game.player.moving && game.player.support && this.steps <= 0) { this.note(110 + (this.beat % 2) * 20, .06, .025, 'triangle', 0, 60); this.steps = .29; }
    if (game.museumStopped) return;
    this.clock -= dt; if (this.clock > 0) return; this.clock = .34; this.beat++;
    // Every moving exhibit owns an instrument. Taking its movement removes that voice.
    const live = game.objects.filter(o => o.program);
    for (let i = 0; i < live.length; i++) {
      const o = live[i], sequence = o.program.type === 'orbit' ? [0, 7, 11, 14, 19, 14, 11, 7] : o.program.type === 'lift' ? [0, 4, 7, 11, 7, 4, 0, -5] : [0, 0, 7, 4, 0, 0, 11, 7];
      if (this.beat % 2 === 0 || o.program.type === 'orbit') this.note((o.kind === 'sculpture' ? 220 : 146.83) * 2 ** (sequence[(this.beat + i * 2) % sequence.length] / 12), o.kind === 'cage' ? 1.1 : .4, .023, o.kind === 'scanner' ? 'triangle' : 'sine');
    }
    if (this.beat % 8 === 0) this.note(55, 2, .025);
  }
}
