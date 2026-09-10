import test from 'node:test';
import assert from 'node:assert/strict';
import { Museum, offset } from '../engine.js';
import { MuseumRenderer } from '../render.js';
import { LEVELS } from '../levels.js';

const DT = 1 / 120;
function run(game, seconds, input = {}) { for (let i = 0; i < seconds / DT; i++) game.update(DT, input); }
function until(game, predicate, seconds = 30, input = {}) {
  for (let i = 0; i < seconds / DT; i++) { if (predicate()) return true; game.update(DT, typeof input === 'function' ? input() : input); }
  return !!predicate();
}
const object = (g, id) => g.objects.find(o => o.id === id);
function walk(game, x, z, seconds = 20) {
  const okay = until(game, () => game.state !== 'playing' || Math.hypot(game.player.x - x, game.player.z - z) < .13, seconds, () => {
    const dx = x - game.player.x, dz = z - game.player.z, distance = Math.hypot(dx, dz); return { x: dx / Math.max(.2, distance), z: dz / Math.max(.2, distance) };
  });
  assert.ok(okay, `walk blocked: room ${game.index + 1}, player ${JSON.stringify(game.player)}, target ${x},${z}`);
}
function bridge(game) { run(game, 2.75); game.interact('bridge'); assert.ok(Math.abs(object(game, 'bridge').x - 9) < .04); walk(game, 9, 2.8); }
function lift(game) {
  game.interact('bust'); game.interact('slab'); walk(game, 9, 11.8);
  assert.ok(until(game, () => object(game, 'slab').t < .012 && object(game, 'slab').transition <= 0, 12));
  walk(game, 9, 9.6); assert.equal(game.player.support, 'slab');
  assert.ok(until(game, () => game.player.y > 3.95, 12)); walk(game, 9, 3);
}
function column(game) {
  run(game, 4.95); game.interact('column'); game.interact('slab'); walk(game, 9, 13.4);
  assert.ok(until(game, () => object(game, 'slab').t < .01 && object(game, 'slab').transition <= 0, 12));
  walk(game, 9, 11); assert.equal(game.player.support, 'slab');
  assert.ok(until(game, () => game.player.y > 4.74, 12)); walk(game, 9, 2.5);
}
function scanner(game) {
  game.interact('scanner'); game.interact('ferry'); walk(game, 5.3, 11);
  assert.ok(until(game, () => object(game, 'ferry').t < .012 && object(game, 'ferry').transition <= 0, 20));
  assert.ok(until(game, () => game.player.support === 'ferry', 3, { x: 1 }));
  assert.ok(until(game, () => game.player.support === 'end', 10)); walk(game, 15, 11); walk(game, 15, 5.5);
}
function orbit(game) {
  game.interact('orbit'); game.interact('disc');
  walk(game, 14, 15.35);
  assert.ok(until(game, () => object(game, 'disc').t < .007 && object(game, 'disc').transition <= 0, 20));
  assert.ok(until(game, () => game.player.support === 'disc', 2, { z: -1 }));
  assert.ok(until(game, () => game.player.support === 'end', 12)); walk(game, 4, game.player.z); walk(game, 4, 3);
}
function disagreements(game) {
  // Wait at the edge, board the first floor near its lower turning point.
  walk(game, 9, 14.55);
  assert.ok(until(game, () => object(game, 'first').y + .5 < .06, 12));
  assert.ok(until(game, () => game.player.support === 'first', 2, { z: -1 }));
  assert.ok(until(game, () => object(game, 'first').y + .5 > 3.98, 12));
  game.interact('first'); game.interact('spare');
  assert.ok(until(game, () => object(game, 'second').y + .5 > 3.98, 12)); game.interact('second');
  walk(game, 9, 2.5);
}
function curator(game) {
  run(game, 3); game.interact('bridge'); game.interact('cage'); run(game, 1);
  walk(game, 9, 11.5); assert.equal(game.interact('sun'), true); assert.equal(game.museumStopped, true); assert.equal(game.inventory.program.prize, true);
  walk(game, 9, 2);
}

test('motions have bounded, deterministic tracks and orbit leaves the starting dock', () => {
  const rail = { type: 'shuttle', dx: 12 }; assert.deepEqual(offset(rail, 0), { x: 0, y: 0, z: 0 }); assert.ok(Math.abs(offset(rail, .5).x - 12) < .001);
  const rise = { type: 'lift', dy: 4 }; assert.ok(Math.abs(offset(rise, .25).y - 2) < .001);
  const round = { type: 'orbit', radius: 5 }; assert.ok(offset(round, .1).z < 0); assert.ok(Math.abs(offset(round, 1).x) < .001);
});
test('theft freezes the actual current position and transfer preserves motion without ratcheting', () => {
  const game = new Museum({ level: 1 }); run(game, 1); const bust = object(game, 'bust'), frozen = { x: bust.x, y: bust.y, z: bust.z }, phase = bust.t;
  game.interact('bust'); run(game, 2); assert.deepEqual({ x: bust.x, y: bust.y, z: bust.z }, frozen); assert.equal(game.inventory.t, phase);
  const slab = object(game, 'slab'), origin = { ...slab.origin }; game.interact('slab'); run(game, 1); assert.equal(slab.program.type, 'lift'); assert.equal(game.inventory, null);
  for (let i = 0; i < 5; i++) { game.interact('slab'); game.interact('slab'); run(game, .6); }
  assert.deepEqual(slab.origin, origin); assert.ok(slab.y >= origin.y - .001 && slab.y <= origin.y + 4.001);
});
test('exchange conserves both programs and undo restores geometry, hand and player position', () => {
  const game = new Museum({ level: 5 }); run(game, 1); game.interact('first'); const before = game.snapshot(); game.interact('second');
  assert.ok(object(game, 'second').program); assert.ok(game.inventory); assert.equal(game.objects.filter(o => o.program).length + Number(!!game.inventory), 2);
  run(game, 1, { x: .5 }); assert.equal(game.undo(), true); assert.deepEqual(game.snapshot(), before);
});
test('a lift carries a supported thief in all three axes', () => {
  const game = new Museum({ level: 4 }); game.interact('orbit'); game.interact('disc'); run(game, .6);
  const disc = object(game, 'disc'); Object.assign(game.player, { x: disc.x, y: disc.y + disc.h, z: disc.z, vy: 0, support: disc.id });
  const before = { ...game.player }, old = { x: disc.x, y: disc.y, z: disc.z }; game.update(DT);
  assert.ok(Math.abs(game.player.x - before.x - (disc.x - old.x)) < .001); assert.ok(Math.abs(game.player.z - before.z - (disc.z - old.z)) < .001);
});
test('repeated resets do not duplicate catalogue notes', () => {
  const game = new Museum(); const n = game.notes[0]; Object.assign(game.player, { x: n.x, y: n.y, z: n.z }); run(game, .02); assert.equal(game.stats.notes, 1);
  game.reset(); assert.equal(game.notes[0].found, true); Object.assign(game.player, { x: n.x, y: n.y, z: n.z }); run(game, .02); assert.equal(game.stats.notes, 1);
});
test('the little sun cannot be taken through the cage or from across the room', () => {
  const game = new Museum({ level: 6 }); assert.equal(game.interact('sun'), false); Object.assign(game.player, { x: 9, y: 0, z: 11.5 }); assert.equal(game.interact('sun'), false); assert.ok(object(game, 'sun').program);
});
test('all seven spatial puzzles are solvable with actual walking, theft and waiting', () => {
  const game = new Museum(); const routes = [bridge, lift, column, scanner, orbit, disagreements, curator];
  for (let index = 0; index < routes.length; index++) {
    assert.equal(game.index, index); const falls = game.stats.falls, alarms = game.stats.alarms;
    routes[index](game); assert.equal(game.state, 'complete', `room ${index + 1} did not complete`);
    assert.equal(game.stats.falls, falls, `room ${index + 1} fell`); assert.equal(game.stats.alarms, alarms, `room ${index + 1} alarmed`); assert.equal(game.next(), true);
  }
  assert.equal(game.index, 7); assert.ok(game.inventory.program.prize); walk(game, 9, 8); assert.equal(game.interact('bird'), true); assert.equal(game.state, 'ending'); run(game, 6); assert.equal(game.state, 'won');
});
test('reset and undo keep every mistimed theft recoverable', () => {
  const game = new Museum({ level: 2 }); run(game, .3); game.interact('column'); game.interact('slab'); assert.equal(game.undo(), true); assert.equal(game.undo(), true); assert.ok(object(game, 'column').program); assert.equal(game.inventory, null);
  game.reset(); assert.equal(game.history.length, 0); assert.equal(game.state, 'playing'); assert.equal(game.player.y, game.level.spawn.y);
});
test('3D geometry, projection and software fallback render every chamber at wide and tall aspect ratios', () => {
  let triangles = 0;
  const context = new Proxy({}, { get(target, key) { if (key in target) return target[key]; return (...args) => { if (key === 'fill') triangles++; for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${String(key)} had non-finite data`); }; }, set(target, key, value) { target[key] = value; return true; } });
  const renderer = new MuseumRenderer({ getContext: type => type === 'webgl' ? null : context });
  for (const size of [[1280, 760], [390, 540]]) {
    renderer.resize(...size, 1);
    for (let i = 0; i < LEVELS.length; i++) {
      const g = new Museum({ level: i }); renderer.draw(g, 2, .016);
      assert.ok(renderer.vertices.every(Number.isFinite)); assert.ok(renderer.vertices.length > 1000);
      const p = renderer.project(g.player.x, g.player.y + .7, g.player.z); assert.ok(p.x > 0 && p.x < size[0] && p.y > 0 && p.y < size[1], `player offscreen in room ${i}`);
    }
  }
  assert.ok(triangles > 1000);
});
