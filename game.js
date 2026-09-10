import { Museum, clamp, offset } from './engine.js';
import { LEVELS } from './levels.js';
import { MuseumRenderer } from './render.js';
import { MuseumSound } from './sound.js';

const $ = id => document.getElementById(id), canvas = $('world'), arena = $('arena'), audio = new MuseumSound();
const SAVE = 'motion-thief-progress-v1', SETTINGS = 'motion-thief-settings-v1';
const storage = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Storage is optional; the heist still works. */ } } };
const stored = storage.get(SAVE), settings = storage.get(SETTINGS) || {};
const valid = value => value?.version === 1 && Number.isInteger(value.level) && value.level >= 0 && value.level < LEVELS.length;
let progress = valid(stored) ? stored : { version: 1, level: 0, unlocked: 0, collected: [], completed: false };
progress.unlocked = clamp(Number(progress.unlocked) || 0, 0, 7); progress.collected = Array.isArray(progress.collected) ? progress.collected.filter(n => typeof n === 'string' && /^[0-7]:\d+$/.test(n)) : [];
let renderer;
try { renderer = new MuseumRenderer(canvas); } catch (error) { $('fatal').hidden = false; $('fatal-copy').textContent = 'The display could not start. Try reloading in a browser with hardware acceleration enabled.'; throw error; }
renderer.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)');
let game = new Museum({ emit: onEvent }), mode = 'cover', paused = false, modalClose = null, lastFocus = null, modalType = null;
let last = 0, time = 0, uiClock = 0, messageTime = 0, introTime = 0, pendingNext = 0, hintStep = 0, userZoom = false, stickPointer = null;
const keys = new Set(), touch = { x: 0, y: 0 };
const motionName = program => !program ? 'Still' : program.prize ? 'The last movement' : program.type === 'lift' ? 'Rise & fall' : program.type === 'orbit' ? 'An orbit' : 'A shuttle';
const motionSymbol = program => !program ? '—' : program.type === 'lift' ? '↕' : program.type === 'orbit' ? '↻' : '↔';
const motionVerb = program => !program ? 'STILL' : program.type === 'lift' ? 'RISE & FALL' : program.type === 'orbit' ? 'ORBIT' : 'SHUTTLE';
$('continue').hidden = !valid(stored);

function resize() {
  const rect = arena.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  renderer.resize(rect.width, rect.height, devicePixelRatio || 1);
  if (!userZoom) renderer.zoom = rect.width / rect.height < .85 ? 1.4 : 1.05;
}
new ResizeObserver(resize).observe(arena); resize();
function clearInput() { keys.clear(); touch.x = touch.y = 0; stickPointer = null; $('stick').style.transform = ''; }
function soundLabel() { $('audio').textContent = audio.enabled ? 'Sound on' : 'Sound off'; $('audio').setAttribute('aria-pressed', String(audio.enabled)); }
async function toggleSound() { await audio.toggle(); soundLabel(); settings.sound = audio.enabled; storage.set(SETTINGS, settings); }
$('audio').addEventListener('click', toggleSound);

function save() { if (mode !== 'game') return; progress.level = game.index; progress.unlocked = Math.max(progress.unlocked, game.index); progress.collected = [...game.collected]; storage.set(SAVE, progress); }
function start(index = 0) {
  closeDialog(); clearInput(); paused = false; pendingNext = 0; mode = 'game';
  const inventory = index === 7 ? { program: { type: 'orbit', period: 6, radius: .35, prize: true }, t: 0, from: 'The little sun' } : null;
  game = new Museum({ level: index, emit: onEvent, inventory }); game.collected = new Set(progress.collected); game.stats.notes = game.collected.size; game.notes.forEach(n => n.found = game.collected.has(n.id));
  $('cover').hidden = true; $('sidebar').hidden = false; $('controls').hidden = false; $('room-heading').hidden = false; $('view-controls').hidden = false; $('pause').disabled = false; $('joystick').hidden = !coarse.matches;
  if (!audio.enabled && settings.sound !== false) audio.toggle().then(soundLabel); else audio.unlock();
  renderer.particles = []; renderer.hover = null; renderer.selected = null; renderer.targetYaw = .64; renderer.yaw = .64;
  resize(); enterRoom(); canvas.focus({ preventScroll: true });
}
$('start').addEventListener('click', () => start(0));
$('continue').addEventListener('click', () => start(progress.level));
function enterRoom() {
  pendingNext = 0; hintStep = 0; introTime = 7; clearInput();
  $('room-number').textContent = game.level.number; $('room-name').textContent = game.level.name; $('room-wing').textContent = game.level.wing; $('objective').textContent = game.level.objective;
  $('entry-wing').textContent = `CATALOGUE ${game.level.number} / ${game.index === 7 ? 'OUTSIDE' : 'AFTER HOURS'}`; $('entry-copy').textContent = game.level.intro; $('entry-card').hidden = false;
  renderer.hover = null; renderer.selected = null; createExhibits(); updateUI(); save(); $('curtain').classList.remove('closed');
}
function announce(text, seconds = 4.5) { $('message').textContent = text; $('message').classList.add('visible'); messageTime = seconds; $('entry-card').hidden = true; introTime = 0; }
function onEvent(e) {
  if (renderer) renderer.event(e); audio.event(e);
  if (e.type === 'take') {
    renderer.selected = e.object.id;
    if (!e.object.prize) announce(`${e.object.name} is still. ${motionName(e.taken.program)} is in your hand.`, 3.2);
  }
  if (e.type === 'give') { renderer.selected = e.object.id; if (e.object.kind !== 'bird') announce(`${e.object.name} inherits ${motionName(e.given.program).toLowerCase()}.`, 3.2); }
  if (e.type === 'exchange') announce(`Movements exchanged. ${motionName(e.taken.program)} is now in your hand.`, 3.2);
  if (e.type === 'notice') announce(e.text);
  if (e.type === 'fall') { clearInput(); announce('Back on your feet. Your changes are still here. Undo or reset if you need to.', 4); }
  if (e.type === 'alarm') { clearInput(); announce('Spotted. The scanner needs to face somewhere you will not be.', 4); }
  if (e.type === 'undo') announce('The last exchange has been undone.', 2.4);
  if (e.type === 'reset') { pendingNext = 0; enterRoom(); announce('The room is as you found it.', 2.5); }
  if (e.type === 'note') { progress.collected = [...game.collected]; save(); announce(e.note.text, 7); }
  if (e.type === 'complete') { clearInput(); pendingNext = 1.05; announce(game.index === 6 ? 'No alarms. No clocks. Not even a tick.' : 'The exit accepts your interpretation.', 2); }
  if (e.type === 'enter') enterRoom();
  if (e.type === 'sun-stolen') announce('Every clock stops. Every machine holds its breath. Now walk out.', 7);
  if (e.type === 'freedom') { clearInput(); $('joystick').hidden = true; announce('Some things belong to the air.', 5); }
  if (e.type === 'won') { progress.completed = true; progress.unlocked = 7; save(); showEnding(); }
  if (mode === 'game') updateUI();
}
function createExhibits() {
  $('exhibit-list').replaceChildren();
  game.objects.forEach((o, i) => {
    const button = document.createElement('button'); button.className = 'exhibit'; button.dataset.id = o.id; button.setAttribute('aria-label', `Exhibit ${i + 1}: ${o.name}. Click to take or give its motion.`);
    const index = document.createElement('span'); index.className = 'exhibit-index'; index.textContent = String(i + 1).padStart(2, '0');
    const info = document.createElement('span'), name = document.createElement('span'), state = document.createElement('span'), track = document.createElement('span'), bar = document.createElement('i');
    name.className = 'exhibit-name'; name.textContent = o.name; state.className = 'exhibit-state'; track.className = 'phase-track'; track.append(bar); info.append(name, state); button.append(index, info, track);
    button.addEventListener('click', () => interact(o.id)); button.addEventListener('pointerenter', () => renderer.hover = o.id); button.addEventListener('pointerleave', () => renderer.hover = null); button.addEventListener('focus', () => renderer.hover = o.id); button.addEventListener('blur', () => renderer.hover = null);
    $('exhibit-list').append(button);
  });
}
function interact(id) { if (mode !== 'game' || paused || modalType || game.state !== 'playing') return; game.interact(id); updateUI(); canvas.focus({ preventScroll: true }); }
function updateUI() {
  if (mode !== 'game') return;
  const held = game.inventory; $('pocket').classList.toggle('full', !!held); $('pocket').querySelector('.kicker').textContent = held ? 'A MOVEMENT, BORROWED' : 'YOUR ONE EMPTY HAND';
  $('pocket-symbol').textContent = motionSymbol(held?.program); $('motion-name').textContent = held ? motionName(held.program) : 'Nothing stolen. Yet.';
  $('motion-origin').textContent = held ? `From ${held.from}. Click an exhibit to give or swap.` : 'Click an orange exhibit to take its motion.';
  $('undo').disabled = !game.history.length || game.state !== 'playing'; $('notes-count').textContent = `${game.collected.size} / 7 NOTES`;
  for (const button of $('exhibit-list').children) {
    const o = game.objects.find(o => o.id === button.dataset.id); if (!o) continue;
    const moving = !!o.program && !game.museumStopped; button.classList.toggle('live', moving); button.classList.toggle('selected', renderer.selected === o.id);
    button.querySelector('.exhibit-state').textContent = held ? o.program ? `SWAP ${motionVerb(o.program)}` : `GIVE ${motionVerb(held.program)}` : o.program ? `TAKE ${motionVerb(o.program)}` : 'STILL · NEEDS A MOVEMENT';
    button.querySelector('.phase-track i').style.width = `${o.program ? o.t * 100 : 0}%`;
    button.disabled = game.state !== 'playing' || (game.museumStopped && game.index < 7 && !o.prize);
  }
}
function previewMotion(t) {
  if (mode !== 'game') return; const el = $('motion-preview'), c = el.getContext('2d'), w = el.width, h = el.height, held = game.inventory;
  c.clearRect(0, 0, w, h); c.lineWidth = 1.6; c.strokeStyle = held ? '#5c3028' : '#47625e'; c.fillStyle = held ? '#182e30' : '#92aba2';
  const type = held?.program.type;
  const point = phase => type === 'lift' ? { x: w * .5, y: h * .18 + (1 - Math.cos(phase * Math.PI * 2)) * h * .29 } : type === 'orbit' ? { x: w * .5 + Math.cos(phase * Math.PI * 2) * w * .29, y: h * .5 - Math.sin(phase * Math.PI * 2) * h * .32 } : { x: w * .1 + (1 - Math.cos(phase * Math.PI * 2)) * w * .4, y: h / 2 };
  c.setLineDash(held ? [2, 4] : [2, 6]); c.beginPath(); for (let i = 0; i <= 60; i++) { const p = point(i / 60); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.stroke(); c.setLineDash([]);
  const p = held ? point(renderer.reduced ? .3 : t / 3) : { x: w / 2, y: h / 2 }; c.beginPath(); c.arc(p.x, p.y, held ? 5 : 3, 0, Math.PI * 2); c.fill();
}

function showDialog(type, kicker, title, copy) {
  lastFocus = document.activeElement; modalType = type; clearInput(); $('dialog-kicker').textContent = kicker; $('dialog-title').textContent = title; $('dialog-copy').textContent = copy; $('dialog-body').replaceChildren(); $('dialog-actions').replaceChildren(); $('dialog').hidden = false;
  for (const el of [document.querySelector('.header'), document.querySelector('.workspace'), $('controls'), $('cover')]) el.inert = true;
}
function focusDialog() { requestAnimationFrame(() => $('dialog').querySelector('button')?.focus()); }
function closeDialog() { $('dialog').hidden = true; modalType = null; modalClose = null; for (const el of [document.querySelector('.header'), document.querySelector('.workspace'), $('controls'), $('cover')]) el.inert = false; if (lastFocus?.isConnected) lastFocus.focus(); }
function action(text, handler, secondary = false) { const button = document.createElement('button'); button.className = secondary ? 'secondary' : 'primary'; button.textContent = text; button.addEventListener('click', handler); $('dialog-actions').append(button); return button; }
function resume() { paused = false; closeDialog(); clearInput(); audio.unlock(); }
function pause() {
  if (mode !== 'game' || modalType || game.state === 'ending' || game.state === 'won') return;
  paused = true; showDialog('pause', 'THE MUSEUM WILL WAIT', 'Leave nothing running.', 'Your room will remain exactly as you left it.'); modalClose = resume;
  action('Continue the heist', resume); action('Choose a room', roomMenu, true); action('How to play', help, true); action('Back to the entrance', home, true); focusDialog();
}
function home() { save(); closeDialog(); clearInput(); mode = 'cover'; paused = false; game = new Museum({ emit: onEvent }); $('cover').hidden = false; for (const id of ['sidebar', 'controls', 'room-heading', 'view-controls', 'joystick', 'entry-card', 'exit-tag', 'object-tag']) $(id).hidden = true; $('pause').disabled = true; $('continue').hidden = false; $('message').classList.remove('visible'); $('curtain').classList.remove('closed'); pendingNext = 0; resize(); $('start').focus(); }
$('pause').addEventListener('click', pause);
function help() {
  const wasGame = mode === 'game'; if (wasGame) paused = true;
  showDialog('help', 'A BRIEF INTRODUCTION TO THEFT', 'You steal what things do.', 'Every marked exhibit can hold a movement. You can carry only one.');
  const grid = document.createElement('div'); grid.className = 'help-steps';
  [['01 / TAKE', 'Click an orange object, or its numbered exhibit card. Its motion goes into your hand. The object freezes exactly where it is.'], ['02 / GIVE', 'Click a still object to give it your motion. It follows its own marked track. Click a moving object to exchange its motion with yours.'], ['03 / WALK', 'Use WASD or arrows, or the touch stick. Platforms carry you. Step across at matching heights. There is no jumping.']].forEach(([title, text]) => { const cell = document.createElement('div'), strong = document.createElement('strong'), p = document.createElement('p'); cell.className = 'help-step'; strong.textContent = title; p.textContent = text; cell.append(strong, p); grid.append(cell); });
  const note = document.createElement('p'); note.className = 'help-foot'; note.textContent = 'Q / E turn the camera. + / − zoom. Number keys 1–4 touch the matching exhibit. Z undoes an exchange, including the position you were standing in. R resets this room. H offers progressively clearer help. Escape pauses. M toggles sound. White catalogue slips are optional.';
  $('dialog-body').append(grid, note); const done = () => { closeDialog(); paused = false; clearInput(); }; modalClose = done; action(wasGame ? 'Back to the heist' : 'Understood', done); focusDialog();
}
$('help').addEventListener('click', help);
function roomMenu() {
  showDialog('rooms', 'THE FLOOR PLAN', 'Choose your inconvenience.', 'Every unlocked room can be replayed. Returning to a room restores its original exhibits.');
  const grid = document.createElement('div'); grid.className = 'room-list';
  LEVELS.forEach((level, i) => { const b = document.createElement('button'), n = document.createElement('strong'), name = document.createElement('span'); b.className = 'room-button'; b.disabled = i > progress.unlocked; n.textContent = level.number; name.textContent = i > progress.unlocked ? 'Not reached yet' : level.name; b.append(n, name); b.addEventListener('click', () => start(i)); grid.append(b); });
  $('dialog-body').append(grid); modalClose = resume; action('Back', resume, true); focusDialog();
}
function showEnding() {
  showDialog('ending', 'ACQUISITION STATUS / RELEASED', 'The collection is incomplete.', 'Somewhere, a curator is counting everything he still owns. He will be counting for a very long time.');
  const text = document.createElement('p'); text.className = 'catalogue'; text.textContent = 'You took a movement that belonged to everyone and gave it to something that belonged to no one.';
  const stats = document.createElement('div'); stats.className = 'run-stats';
  [[game.stats.thefts, 'MOTIONS BORROWED'], [game.stats.gifts, 'NEW POSSIBILITIES'], [game.collected.size + ' / 7', 'NOTES FOUND']].forEach(([n, label]) => { const el = document.createElement('div'), value = document.createElement('strong'), caption = document.createElement('span'); value.textContent = n; caption.textContent = label; el.append(value, caption); stats.append(el); });
  $('dialog-body').append(text, stats); action('Visit the rooms again', roomMenu); action('Return to the entrance', home, true); focusDialog();
}
$('undo').addEventListener('click', () => { if (!paused && !modalType) { clearInput(); game.undo(); updateUI(); } });
$('reset').addEventListener('click', () => { if (!paused && !modalType) { clearInput(); game.reset(); } });
function hint() { if (mode !== 'game' || modalType || game.state !== 'playing') return; announce(game.level.hints[Math.min(hintStep++, game.level.hints.length - 1)], 10); }
$('hint').addEventListener('click', hint);
$('rotate-left').addEventListener('click', () => renderer.targetYaw -= Math.PI / 2); $('rotate-right').addEventListener('click', () => renderer.targetYaw += Math.PI / 2);
function zoom(delta) { renderer.zoom = clamp(renderer.zoom + delta, .7, 2.1); userZoom = true; }
$('zoom-in').addEventListener('click', () => zoom(.15)); $('zoom-out').addEventListener('click', () => zoom(-.15));
canvas.addEventListener('wheel', e => { if (mode !== 'game' || modalType) return; e.preventDefault(); zoom(e.deltaY < 0 ? .08 : -.08); }, { passive: false });
function pointerLocation(event) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
canvas.addEventListener('pointermove', event => { if (mode !== 'game' || paused || modalType) return; const p = pointerLocation(event); renderer.hover = renderer.pick(p.x, p.y, game)?.id || null; canvas.style.cursor = renderer.hover ? 'pointer' : 'default'; });
canvas.addEventListener('pointerleave', () => renderer.hover = null);
canvas.addEventListener('click', event => { if (mode !== 'game' || paused || modalType) return; const p = pointerLocation(event), o = renderer.pick(p.x, p.y, game); if (o) interact(o.id); canvas.focus({ preventScroll: true }); });
const joystick = $('joystick');
function updateStick(event) { const r = joystick.getBoundingClientRect(), max = r.width * .33, x = event.clientX - (r.left + r.width / 2), y = event.clientY - (r.top + r.height / 2), length = Math.max(1, Math.hypot(x, y) / max); touch.x = clamp(x / length / max, -1, 1); touch.y = clamp(y / length / max, -1, 1); $('stick').style.transform = `translate(${touch.x * 27}px,${touch.y * 27}px)`; }
joystick.addEventListener('pointerdown', event => { if (stickPointer !== null || modalType || paused) return; event.preventDefault(); stickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); updateStick(event); audio.unlock(); });
joystick.addEventListener('pointermove', event => { if (stickPointer === event.pointerId) { event.preventDefault(); updateStick(event); } });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(type, event => { if (stickPointer === event.pointerId) { stickPointer = null; touch.x = touch.y = 0; $('stick').style.transform = ''; } });
document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && modalType) {
    const buttons = [...$('dialog').querySelectorAll('button')].filter(b => !b.disabled), first = buttons[0], end = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end?.focus(); } else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); } return;
  }
  if (event.key === 'Escape') { event.preventDefault(); if (modalClose) modalClose(); else if (!modalType) pause(); return; }
  if (event.target instanceof Element && event.target.closest('input,select,textarea')) return;
  if (event.target instanceof Element && event.target.closest('button,a') && [' ', 'Enter'].includes(event.key)) return;
  if (modalType) return;
  const key = event.key.toLowerCase();
  if (key === 'm' && !event.repeat) { toggleSound(); return; }
  if (mode !== 'game' || paused) return;
  if (event.key.startsWith('Arrow') || event.key === ' ') event.preventDefault();
  if (!event.repeat) {
    if (key === 'q') renderer.targetYaw -= Math.PI / 2;
    if (key === 'e') renderer.targetYaw += Math.PI / 2;
    if (key === '+' || key === '=') zoom(.15);
    if (key === '-') zoom(-.15);
    if (key === 'z') { clearInput(); game.undo(); updateUI(); }
    if (key === 'r') { clearInput(); game.reset(); }
    if (key === 'h') hint();
    if (/^[1-4]$/.test(key)) { const o = game.objects[Number(key) - 1]; if (o) interact(o.id); }
  }
  keys.add(key);
});
document.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); if (mode === 'game' && !modalType) pause(); });
document.addEventListener('visibilitychange', () => { clearInput(); if (document.hidden && mode === 'game' && !modalType) pause(); });

function screenLabels() {
  if (mode !== 'game') return;
  const exit = game.level.exit; $('exit-tag').hidden = !exit || !!modalType;
  if (exit) { const p = renderer.project(exit.x, exit.y + 3, exit.z); $('exit-tag').style.left = `${p.x}px`; $('exit-tag').style.top = `${p.y}px`; }
  const object = game.objects.find(o => o.id === renderer.hover); $('object-tag').hidden = !object || !!modalType;
  if (object) { const p = renderer.project(object.x, object.y + object.h + .7, object.z); $('object-tag').textContent = game.inventory ? object.program ? 'SWAP MOVEMENTS' : 'GIVE MOVEMENT' : object.program ? 'TAKE MOVEMENT' : 'A PLACE FOR MOVEMENT'; $('object-tag').style.left = `${clamp(p.x, 75, renderer.width - 75)}px`; $('object-tag').style.top = `${clamp(p.y, 135, renderer.height - 20)}px`; }
}
function frame(timestamp) {
  const dt = Math.min(1 / 30, Math.max(0, (timestamp - (last || timestamp)) / 1000)); last = timestamp;
  const active = !paused && !modalType && !document.hidden;
  if (active) time += dt;
  if (mode === 'cover') {
    // Start-screen theatre uses the actual room and mechanics, with the thief at rest.
    if (active) game.update(dt);
  } else if (active) {
    let x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + touch.x;
    let y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) + touch.y;
    if (Math.abs(x) < .12) x = 0; if (Math.abs(y) < .12) y = 0;
    const cos = Math.cos(renderer.yaw), sin = Math.sin(renderer.yaw);
    game.update(dt, { x: x * cos + y * sin, z: -x * sin + y * cos });
    if (pendingNext > 0) { pendingNext -= dt; if (pendingNext < .3) $('curtain').classList.add('closed'); if (pendingNext <= 0) game.next(); }
    if (introTime > 0) { introTime -= dt; if (introTime <= 0) $('entry-card').hidden = true; }
    if (messageTime > 0) { messageTime -= dt; if (messageTime <= 0) $('message').classList.remove('visible'); }
    audio.tick(dt, game);
  }
  renderer.draw(game, time, active ? dt : 0); screenLabels(); previewMotion(time);
  uiClock -= dt; if (uiClock <= 0) { updateUI(); uiClock = .1; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
