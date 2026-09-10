import { LEVELS } from './levels.js';
export const TAU = Math.PI * 2;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const copy = data => JSON.parse(JSON.stringify(data));
export function offset(program, time = program?.phase || 0) {
  if (!program) return { x: 0, y: 0, z: 0 };
  const a = time * TAU, f = (1 - Math.cos(a)) / 2;
  if (program.type === 'orbit') return { x: (Math.cos(a) - 1) * program.radius, y: 0, z: -Math.sin(a) * program.radius };
  return { x: (program.dx || 0) * f, y: (program.dy || 0) * f, z: (program.dz || 0) * f };
}
export const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const inside = (p, box, radius = 0) => Math.abs(p.x - box.x) < box.w / 2 + radius && Math.abs(p.z - box.z) < box.d / 2 + radius;

export class Museum {
  constructor({ level = 0, emit = () => {}, inventory = null } = {}) {
    this.emit = emit; this.inventory = inventory; this.history = []; this.collected = new Set(); this.stats = { thefts: 0, gifts: 0, alarms: 0, falls: 0, notes: 0, time: 0 }; this.load(level, inventory);
  }
  event(type, details = {}) { this.emit({ type, ...details }); }
  load(index, carried = null) {
    this.index = clamp(index, 0, LEVELS.length - 1); this.level = copy(LEVELS[this.index]); this.time = 0; this.state = 'playing'; this.history = []; this.inventory = carried;
    this.floor = copy(this.level.floors); this.objects = this.level.objects.map(o => ({ ...o, origin: { x: o.x, y: o.y, z: o.z }, t: o.program?.phase || 0, transition: 0 }));
    for (const o of this.objects) { const v = offset(o.program, o.t); o.x += v.x; o.y += v.y; o.z += v.z; o.prev = { x: o.x, y: o.y, z: o.z }; }
    this.player = { ...this.level.spawn, vy: 0, radius: .25, height: 1.18, support: 'start', heading: Math.PI, stride: 0, moving: false, grace: 2.3 };
    this.notes = this.level.notes.map((note, i) => ({ ...note, id: `${this.index}:${i}`, found: this.collected.has(`${this.index}:${i}`) })); this.museumStopped = this.index === 7; this.exitClock = 0; this.wonClock = 0; this.cameraKick = 0;
  }
  snapshot() { return copy({ objects: this.objects, player: this.player, inventory: this.inventory, museumStopped: this.museumStopped, time: this.time }); }
  undo() {
    if (!this.history.length || this.state !== 'playing') return false;
    Object.assign(this, this.history.pop()); this.event('undo'); return true;
  }
  reset() { const inventory = this.index === 7 ? { program: { type: 'orbit', radius: .35, period: 6, prize: true }, t: 0, from: 'The little sun' } : null; this.load(this.index, inventory); this.event('reset'); }
  get solids() { return [...this.floor, ...this.objects.filter(o => o.solid !== false)]; }
  interact(id) {
    if (this.state !== 'playing') return false;
    const o = this.objects.find(o => o.id === id); if (!o) return false;
    if ((o.prize || o.kind === 'bird') && horizontalDistance(this.player, o) > 1.8) { this.event('notice', { text: 'Walk closer. This one needs a human touch.' }); return false; }
    if (o.prize) {
      const cage = this.objects.find(o => o.kind === 'cage');
      if (cage && inside(o, cage, .5)) { this.event('notice', { text: 'The cage is in the way. Give it somewhere else to be.' }); return false; }
      if (this.inventory) { this.event('notice', { text: 'You need an empty hand for the little sun. Leave your spare motion somewhere.' }); return false; }
    }
    if (this.museumStopped && this.index !== 7 && !o.prize) { this.event('notice', { text: 'The museum is still. Carry the little sun outside.' }); return false; }
    if (!o.program && !this.inventory) { this.event('notice', { text: 'Nothing to take. Borrow a movement from an orange exhibit first.' }); return false; }
    this.history.push(this.snapshot()); if (this.history.length > 40) this.history.shift();
    const taken = o.program ? { program: copy(o.program), t: o.t, from: o.name } : null;
    const given = this.inventory;
    if (given) { o.program = copy(given.program); o.t = given.t; o.transition = .55; o.fromPosition = { x: o.x, y: o.y, z: o.z }; this.stats.gifts++; }
    else { o.program = null; o.transition = 0; }
    this.inventory = taken;
    if (taken) this.stats.thefts++;
    if (o.prize && taken) { this.museumStopped = true; this.event('sun-stolen'); }
    if (o.kind === 'bird' && given?.program.prize) { this.state = 'ending'; this.wonClock = 0; this.event('freedom'); }
    this.event(given && taken ? 'exchange' : given ? 'give' : 'take', { object: o, taken, given }); return true;
  }
  respawn(reason) {
    Object.assign(this.player, this.level.spawn, { vy: 0, support: null, moving: false, grace: 2.5 });
    if (reason === 'alarm') this.stats.alarms++; else this.stats.falls++;
    this.event(reason); this.cameraKick = reason === 'alarm' ? .2 : .1;
  }
  moveAxis(axis, delta) {
    const p = this.player; p[axis] += delta;
    for (const box of this.solids) {
      const top = box.y + box.h;
      if (top <= p.y + .27 || box.y >= p.y + p.height - .06) continue;
      if (!inside(p, box, p.radius)) continue;
      const other = axis === 'x' ? 'z' : 'x'; const extent = axis === 'x' ? box.w : box.d, otherExtent = axis === 'x' ? box.d : box.w;
      if (Math.abs(p[other] - box[other]) >= otherExtent / 2 + p.radius - .025) continue;
      if (delta > 0) p[axis] = box[axis] - extent / 2 - p.radius;
      else if (delta < 0) p[axis] = box[axis] + extent / 2 + p.radius;
    }
  }
  update(dt, input = {}) {
    if (this.state === 'complete' || this.state === 'won') return;
    dt = clamp(dt, 0, 1 / 30); this.time += dt; this.stats.time += dt;
    if (this.state === 'ending') { this.wonClock += dt; const bird = this.objects.find(o => o.kind === 'bird'); if (bird) { bird.y += dt * .7; bird.z -= dt * 1.6; bird.x += dt * .5; } if (this.wonClock > 5.5) { this.state = 'won'; this.event('won'); } return; }
    const p = this.player;
    for (const o of this.objects) {
      o.prev = { x: o.x, y: o.y, z: o.z };
      if (!o.program || this.museumStopped) continue;
      o.t = (o.t + dt / o.program.period) % 1; const v = offset(o.program, o.t); const target = { x: o.origin.x + v.x, y: o.origin.y + v.y, z: o.origin.z + v.z };
      if (o.transition > 0) { o.transition = Math.max(0, o.transition - dt); const a = 1 - (o.transition / .55) ** 2; for (const key of ['x', 'y', 'z']) o[key] = o.fromPosition[key] + (target[key] - o.fromPosition[key]) * a; }
      else Object.assign(o, target);
    }
    const support = this.objects.find(o => o.id === p.support);
    if (support) { p.x += support.x - support.prev.x; p.y += support.y - support.prev.y; p.z += support.z - support.prev.z; }
    const dx = Number(input.x) || 0, dz = Number(input.z) || 0, length = Math.hypot(dx, dz), speed = 3.9;
    p.moving = length > .08;
    if (p.moving) { const multiplier = speed * dt / Math.max(1, length); this.moveAxis('x', dx * multiplier); this.moveAxis('z', dz * multiplier); p.heading = Math.atan2(dx, dz); p.stride += dt * 10; }
    p.x = clamp(p.x, -.5, 19.5); p.z = clamp(p.z, -.5, 21);
    const oldY = p.y; p.vy -= 18 * dt; p.y += p.vy * dt; let landed = null;
    if (p.vy <= 0) for (const box of this.solids) {
      const top = box.y + box.h;
      if (inside(p, box, -.03) && oldY >= top - .28 && p.y <= top && (!landed || top > landed.y + landed.h)) landed = box;
    }
    if (landed) { p.y = landed.y + landed.h; p.vy = 0; p.support = landed.id; } else p.support = null;
    if (p.y < -7) { this.respawn('fall'); return; }
    p.grace = Math.max(0, p.grace - dt);
    for (const scanner of this.objects.filter(o => o.kind === 'scanner')) {
      if (p.grace === 0 && p.z > 4.2 && p.z < 19 && Math.abs(p.x - scanner.x) < .18 + p.radius && p.y < 1.9) { this.respawn('alarm'); return; }
    }
    for (const n of this.notes) if (!n.found && horizontalDistance(p, n) < .65 && Math.abs(p.y - n.y) < .6) { n.found = true; this.collected.add(n.id); this.stats.notes = this.collected.size; this.event('note', { note: n }); }
    const exit = this.level.exit;
    if (exit && horizontalDistance(p, exit) < .85 && Math.abs(p.y - exit.y) < .4) {
      if (this.index === 6 && !this.inventory?.program.prize) { if (this.exitClock <= 0) { this.event('notice', { text: 'The little sun is still inside. That is what you came for.' }); this.exitClock = 3; } }
      else { this.state = 'complete'; this.event('complete', { index: this.index }); }
    }
    this.exitClock = Math.max(0, this.exitClock - dt);
  }
  next() { if (this.state !== 'complete') return false; const carried = this.index === 6 ? copy(this.inventory) : null; this.load(this.index + 1, carried); this.event('enter'); return true; }
}
