import { TAU, clamp, offset, inside } from './engine.js';

const palette = { ivory: '#d7dacc', orange: '#fa633c', teal: '#55bdb3', dark: '#20343a', black: '#142329', gold: '#efbf65', white: '#f9f1dc', red: '#ef4a4a', grey: '#719496' };
const rgb = color => { const value = palette[color] || color; const n = parseInt(value.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const normalize = v => { const l = Math.hypot(...v) || 1; return v.map(n => n / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
function lookAt(eye, target) {
  const z = normalize(eye.map((v, i) => v - target[i])), x = normalize(cross([0, 1, 0], z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}
function ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; }
function multiply(a, b) { const o = new Array(16).fill(0); for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) o[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k]; return o; }
const vector = (m, p) => [0, 1, 2, 3].map(row => m[row] * p[0] + m[4 + row] * p[1] + m[8 + row] * p[2] + m[12 + row]);

export class MuseumRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power' });
    this.yaw = .64; this.targetYaw = .64; this.zoom = 1; this.width = 1000; this.height = 700; this.particles = []; this.lines = []; this.frame = 0; this.selected = null; this.hover = null;
    this.bg = rgb('#14242c'); this.vertices = []; this.triangles = []; this.matrix = null; this.cameraTarget = [9, 1, 10]; this.reduced = false;
    if (this.gl) this.initGL(); else this.context = canvas.getContext('2d');
  }
  initGL() {
    const gl = this.gl;
    const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s; };
    const vertex = shader(gl.VERTEX_SHADER, `attribute vec3 a_position; attribute vec3 a_normal; attribute vec3 a_color; uniform mat4 u_matrix; varying vec3 v_color; varying float v_height; void main(){ float light=.58+max(dot(normalize(a_normal),normalize(vec3(-.5,1.0,.55))),0.0)*.44; v_color=a_color*light; v_height=a_position.y; gl_Position=u_matrix*vec4(a_position,1.0); }`);
    const fragment = shader(gl.FRAGMENT_SHADER, `precision mediump float; varying vec3 v_color; varying float v_height; void main(){vec3 c=v_color; c=mix(c,vec3(.075,.15,.18),clamp(-v_height*.025,0.0,.25)); gl_FragColor=vec4(c,1.0);}`);
    this.program = gl.createProgram(); gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
    this.buffer = gl.createBuffer(); this.locations = ['a_position', 'a_normal', 'a_color'].map(n => gl.getAttribLocation(this.program, n)); this.matrixLoc = gl.getUniformLocation(this.program, 'u_matrix');
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    canvasContextEvents(this);
  }
  resize(w, h, dpr = 1) { this.width = Math.max(1, w); this.height = Math.max(1, h); this.dpr = Math.min(dpr, 1.7); this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr); }
  project(x, y, z) { if (!this.matrix) return { x: 0, y: 0, depth: 0 }; const p = vector(this.matrix, [x, y, z]); return { x: (p[0] / p[3] * .5 + .5) * this.width, y: (-p[1] / p[3] * .5 + .5) * this.height, depth: p[2] / p[3] }; }
  triangle(a, b, c, color) {
    const normal = normalize(cross(b.map((v, i) => v - a[i]), c.map((v, i) => v - a[i]))), col = typeof color === 'string' ? rgb(color) : color;
    for (const point of [a, b, c]) this.vertices.push(...point, ...normal, ...col);
    if (!this.gl) this.triangles.push({ points: [a, b, c], color: col, normal });
  }
  quad(a, b, c, d, color) { this.triangle(a, b, c, color); this.triangle(a, c, d, color); }
  box(x, y, z, w, h, d, color, angle = 0) {
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const p = (a, b, c) => [x + a * cos + c * sin, y + b, z - a * sin + c * cos];
    const a = p(-w / 2, 0, -d / 2), b = p(w / 2, 0, -d / 2), c = p(w / 2, 0, d / 2), e = p(-w / 2, 0, d / 2), f = p(-w / 2, h, -d / 2), g = p(w / 2, h, -d / 2), i = p(w / 2, h, d / 2), j = p(-w / 2, h, d / 2);
    this.quad(f, j, i, g, color); this.quad(a, b, c, e, color); this.quad(a, f, g, b, color); this.quad(e, c, i, j, color); this.quad(a, e, j, f, color); this.quad(b, g, i, c, color);
  }
  cylinder(x, y, z, r, h, color, n = 12) {
    for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; const p = [x + Math.cos(a) * r, y, z + Math.sin(a) * r], q = [x + Math.cos(b) * r, y, z + Math.sin(b) * r]; const u = [p[0], y + h, p[2]], v = [q[0], y + h, q[2]]; this.quad(p, u, v, q, color); this.triangle([x, y + h, z], v, u, color); }
  }
  octahedron(x, y, z, r, color, rotation = 0) {
    const ring = [0, 1, 2, 3].map(i => [x + Math.cos(i * Math.PI / 2 + rotation) * r, y, z + Math.sin(i * Math.PI / 2 + rotation) * r]);
    for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; this.triangle([x, y + r * 1.3, z], a, b, color); this.triangle([x, y - r * 1.3, z], b, a, color); }
  }
  ribbon(a, b, width, color) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < .001) { this.box(a.x, Math.min(a.y, b.y), a.z, width, Math.max(.03, Math.abs(b.y - a.y)), width, color); return; }
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    this.quad([a.x + nx, a.y, a.z + nz], [b.x + nx, b.y, b.z + nz], [b.x - nx, b.y, b.z - nz], [a.x - nx, a.y, a.z - nz], color);
  }
  event(event) {
    if (event.object) { const o = event.object, color = event.type === 'take' ? 'orange' : 'teal'; for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; this.particles.push({ x: o.x, y: o.y + o.h + .2, z: o.z, vx: Math.cos(a) * (1 + Math.random() * 2), vy: .8 + Math.random() * 2, vz: Math.sin(a) * (1 + Math.random() * 2), life: 1.2, color }); } }
    if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
  }
  path(o, program, t, preview = false) {
    if (!program) return;
    const pieces = program.type === 'orbit' ? 52 : 32, color = preview ? 'gold' : 'grey';
    for (let i = 0; i < pieces; i++) {
      const phase = i / pieces, v = offset(program, phase), base = o.origin;
      if (i % 2 === 0 || preview) this.box(base.x + v.x, base.y + v.y + o.h + .09, base.z + v.z, preview ? .075 : .035, .035, preview ? .075 : .035, color);
    }
  }
  floorDetail(f, game) {
    this.box(f.x, f.y, f.z, f.w, f.h, f.d, game.index === 7 ? '#d5c29b' : 'ivory');
    const top = f.y + f.h;
    this.box(f.x, top + .005, f.z - f.d / 2 + .075, f.w - .12, .015, .075, 'gold');
    this.box(f.x - f.w / 2 + .075, top + .005, f.z, .075, .015, f.d - .12, 'gold');
    const lines = Math.floor(f.d / 2);
    for (let j = 1; j < lines; j++) this.box(f.x, top + .003, f.z - f.d / 2 + j * 2, f.w, .005, .015, '#b4c4b8');
    if (f.w > 7) for (let j = 1; j < Math.floor(f.w / 3); j++) this.box(f.x - f.w / 2 + j * 3, top + .004, f.z, .012, .004, f.d, '#b4c4b8');
    // Structural supports make the architecture tangible and leave the void readable.
    const supportH = 1.7 + Math.max(0, top) * .5;
    if (f.w > 3) for (const side of [-1, 1]) this.box(f.x + side * (f.w / 2 - .5), f.y - supportH, f.z, .6, supportH, Math.max(.6, f.d * .5), '#456063');
  }
  exhibit(o, game, t) {
    const top = o.y + o.h, live = !!o.program && !game.museumStopped, color = live ? 'orange' : o.kind === 'cage' ? 'dark' : 'teal';
    if (o.kind === 'platform') {
      this.box(o.x, o.y, o.z, o.w, o.h, o.d, 'dark'); this.box(o.x, top - .09, o.z, o.w, .09, o.d, 'ivory');
      this.box(o.x, top + .008, o.z - o.d / 2 + .09, o.w - .1, .015, .1, color); this.box(o.x, top + .008, o.z + o.d / 2 - .09, o.w - .1, .015, .1, color);
      for (let j = 0; j < 5; j++) this.box(o.x - o.w * .34 + j * o.w * .17, top + .015, o.z, .11, .012, Math.min(.75, o.d * .3), color, -.3);
      this.cylinder(o.x, top + .02, o.z, .14, .06, color);
    } else if (o.kind === 'sculpture') {
      this.cylinder(o.x, o.y, o.z, o.w * .67, .2, 'dark'); this.box(o.x, o.y + .2, o.z, o.w * .55, o.h * .48, o.d * .55, 'ivory');
      this.octahedron(o.x, o.y + o.h * .83, o.z, o.w * .51, color, live ? t * .25 : .3);
      this.box(o.x, o.y + o.h * .52, o.z, o.w * 1.1, .15, o.d * .6, 'gold', .4);
    } else if (o.kind === 'scanner') {
      this.cylinder(o.x, o.y, o.z, .55, .22, 'dark'); this.box(o.x, o.y + .2, o.z, .24, 1.15, .24, 'ivory'); this.box(o.x, o.y + 1.25, o.z, .9, .55, .6, 'red');
      this.box(o.x, o.y + 1.4, o.z + .33, .35, .18, .06, 'gold');
      this.box(o.x, .018, 11.6, .035, .03, 14.8, 'red');
      for (let j = 0; j < 15; j++) this.box(o.x, .045, 4.5 + j, .25, .045, .07, 'red');
    } else if (o.kind === 'cage') {
      for (const side of [-1, 1]) {
        this.box(o.x + side * o.w / 2, o.y, o.z, .15, o.h, o.d, 'dark');
        for (let j = 0; j < 8; j++) this.box(o.x - o.w / 2 + j * o.w / 7, o.y, o.z + side * o.d / 2, .09, o.h, .1, 'gold');
      }
      this.box(o.x, top - .1, o.z, o.w + .2, .2, o.d + .2, 'dark'); this.box(o.x, top + .1, o.z, o.w * .7, .09, o.d * .7, color);
    } else if (o.kind === 'sun') {
      this.octahedron(o.x, o.y + .2, o.z, .37, game.museumStopped ? 'ivory' : 'gold', game.museumStopped ? 0 : t * .6);
      for (let j = 0; j < 8; j++) { const a = j / 8 * TAU + (game.museumStopped ? 0 : t * .3); this.box(o.x + Math.cos(a) * .7, o.y + .2, o.z + Math.sin(a) * .7, .07, .07, .24, 'gold', -a); }
    } else if (o.kind === 'bird') {
      const fly = game.state === 'ending' || game.state === 'won', flap = fly ? Math.sin(t * 10) * .35 : 0;
      this.octahedron(o.x, o.y + .2, o.z, .27, 'white');
      this.triangle([o.x, o.y + .25, o.z - .1], [o.x - .9, o.y + .65 + flap, o.z + .2], [o.x - .15, o.y + .2, o.z + .5], 'white');
      this.triangle([o.x, o.y + .25, o.z - .1], [o.x + .15, o.y + .2, o.z + .5], [o.x + .9, o.y + .65 + flap, o.z + .2], 'ivory');
      this.triangle([o.x - .1, o.y + .3, o.z - .25], [o.x + .1, o.y + .3, o.z - .25], [o.x, o.y + .2, o.z - .6], 'orange');
    }
    if (this.hover === o.id || this.selected === o.id) {
      const r = Math.max(o.w, o.d) * .6 + .2;
      for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; this.box(o.x + Math.cos(a) * r, top + .07, o.z + Math.sin(a) * r, .09, .04, .09, 'gold'); }
    }
  }
  avatar(game, t) {
    const p = game.player, a = p.heading, bob = p.moving && !this.reduced ? Math.sin(p.stride * 2) * .035 : 0;
    const local = (x, y, z) => ({ x: p.x + x * Math.cos(a) + z * Math.sin(a), y: p.y + y + bob, z: p.z - x * Math.sin(a) + z * Math.cos(a) });
    if (p.support) this.cylinder(p.x, p.y + .013, p.z, .37, .015, '#7b8e7d', 12);
    for (const side of [-1, 1]) { const step = p.moving ? Math.sin(p.stride + (side === 1 ? Math.PI : 0)) * .14 : 0, leg = local(side * .12, .06, step); this.box(leg.x, leg.y, leg.z, .15, .29, .22, 'dark', a); }
    const body = local(0, .31, 0); this.box(body.x, body.y, body.z, .46, .52, .32, 'orange', a);
    const head = local(0, .99, -.015); this.octahedron(head.x, head.y, head.z, .29, 'orange', a + Math.PI / 4);
    const face = local(0, .89, .222); this.box(face.x, face.y, face.z, .32, .18, .055, 'dark', a);
    const eye = local(.07, .99, .26); this.box(eye.x, eye.y, eye.z, .06, .035, .015, 'white', a);
    const bag = local(-.27, .39, -.08); this.box(bag.x, bag.y, bag.z, .21, .31, .23, 'gold', a);
    if (game.inventory) { const hand = local(.39, .82, .13); this.octahedron(hand.x, hand.y, hand.z, .14, 'gold', t); for (let i = 0; i < 7; i++) { const angle = t * 2 + i * .3; this.box(hand.x + Math.cos(angle) * .25, hand.y + Math.sin(angle) * .15, hand.z, .04, .04, .04, 'orange'); } }
  }
  decorations(game, t) {
    const outside = game.index === 7;
    if (!outside) {
      this.box(9, -5, 10, 22, .25, 24, '#192f37');
      // Museum pilasters at the far perimeter, leaving all routes visible.
      for (const x of [-1, 19]) { this.box(x, -2, 0, 1, 10, 1, '#36545a'); this.box(x, 7.8, 0, 1.3, .18, 1.3, 'gold'); }
      this.box(9, 7.75, 0, 21, .24, 1, '#36545a');
      for (let j = 0; j < 6; j++) this.box(1 + j * 3.2, 7.66, .54, .12, .09, .06, 'gold');
    } else {
      for (const x of [3.2, 14.8]) { this.box(x, 0, 2, .5, 3.5, .5, 'dark'); this.box(x, 3.5, 2, 1, .15, 1, 'gold'); }
      this.box(9, -.7, 9, 15, .1, 20, '#34545b');
      for (const x of [3.2, 14.8]) for (let j = 0; j < 8; j++) this.box(x, 0, 3 + j * 2, .09, 1, .09, 'dark');
      this.box(3.2, 1, 10, .12, .1, 15, 'dark'); this.box(14.8, 1, 10, .12, .1, 15, 'dark');
      this.cylinder(9, 0, 8, .55, .65, 'dark');
    }
    if (game.level.exit) {
      const e = game.level.exit;
      this.box(e.x - .72, e.y, e.z, .18, 2.7, .4, 'dark'); this.box(e.x + .72, e.y, e.z, .18, 2.7, .4, 'dark'); this.box(e.x, e.y + 2.53, e.z, 1.65, .22, .4, 'dark');
      this.box(e.x, e.y + 2.65, e.z + .24, .7, .08, .04, 'teal');
      for (let j = 0; j < 3; j++) { this.box(e.x, e.y + .012, e.z + .5 + j * .48, .5 - j * .09, .025, .1, 'teal'); }
    }
    for (const n of game.notes) if (!n.found) { this.box(n.x, n.y + .07, n.z, .35, .07, .45, 'white', -.2); this.box(n.x, n.y + .15 + (this.reduced ? 0 : Math.sin(t * 2) * .07), n.z, .08, .12, .08, 'gold'); }
  }
  draw(game, t, dt = .016) {
    this.frame++; this.vertices = []; this.triangles = [];
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 8);
    const aspect = this.width / this.height, portrait = aspect < .85;
    const focus = portrait ? [9 + (game.player.x - 9) * .25, 1 + game.player.y * .25, 10 + (game.player.z - 10) * .2] : [9, 1.1, 10];
    this.cameraTarget = this.cameraTarget.map((v, i) => v + (focus[i] - v) * Math.min(1, dt * 4));
    const halfH = (portrait ? 17 / aspect : Math.max(12.8, 17 / aspect)) / this.zoom;
    const target = this.cameraTarget, eye = [target[0] + Math.sin(this.yaw) * 30, target[1] + 27, target[2] + Math.cos(this.yaw) * 30];
    this.matrix = multiply(ortho(-halfH * aspect, halfH * aspect, -halfH, halfH, .1, 100), lookAt(eye, target));
    this.decorations(game, t);
    game.floor.forEach(f => this.floorDetail(f, game));
    // Contact shadows on the floor beneath moving exhibits.
    for (const o of game.objects) { const f = game.floor.filter(f => inside(o, f) && f.y + f.h <= o.y + .03).sort((a, b) => b.y - a.y)[0]; if (f && o.kind !== 'cage') this.box(o.x + .12, f.y + f.h + .014, o.z + .1, o.w * .76, .008, o.d * .7, '#92a596'); }
    for (const o of game.objects) { if (o.program && !game.museumStopped) this.path(o, o.program, t); if (this.hover === o.id && game.inventory) this.path(o, game.inventory.program, t, true); this.exhibit(o, game, game.museumStopped ? 0 : t); }
    this.avatar(game, t);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= dt * 2; this.box(p.x, p.y, p.z, .055, .055, .055, p.color); }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.gl) this.renderGL(); else this.renderCanvas();
  }
  renderGL() {
    const gl = this.gl; if (gl.isContextLost()) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(...this.bg, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.matrixLoc, false, new Float32Array(this.matrix)); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(this.locations[i]); gl.vertexAttribPointer(this.locations[i], 3, gl.FLOAT, false, 36, i * 12); }
    gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 9);
  }
  renderCanvas() {
    const c = this.context; if (!c) return; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = '#14242c'; c.fillRect(0, 0, this.width, this.height);
    const triangles = this.triangles.map(t => ({ ...t, projected: t.points.map(p => this.project(...p)) })).sort((a, b) => b.projected.reduce((n, p) => n + p.depth, 0) - a.projected.reduce((n, p) => n + p.depth, 0));
    for (const tr of triangles) { const light = .58 + Math.max(dot(tr.normal, normalize([-.5, 1, .55])), 0) * .44; c.fillStyle = `rgb(${tr.color.map(v => Math.round(clamp(v * light, 0, 1) * 255)).join(',')})`; c.beginPath(); tr.projected.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill(); }
  }
  pick(x, y, game) {
    return game.objects.map(o => {
      const corners = []; for (const a of [-1, 1]) for (const b of [0, 1]) for (const d of [-1, 1]) corners.push(this.project(o.x + a * o.w / 2, o.y + b * o.h, o.z + d * o.d / 2));
      const center = this.project(o.x, o.y + o.h / 2, o.z), minX = Math.min(...corners.map(p => p.x)) - 12, maxX = Math.max(...corners.map(p => p.x)) + 12, minY = Math.min(...corners.map(p => p.y)) - 14, maxY = Math.max(...corners.map(p => p.y)) + 10;
      return { o, hit: x >= minX && x <= maxX && y >= minY && y <= maxY, depth: center.depth, dist: Math.hypot(center.x - x, center.y - y) };
    }).filter(r => r.hit).sort((a, b) => a.depth - b.depth || a.dist - b.dist)[0]?.o || null;
  }
}
function canvasContextEvents(renderer) {
  renderer.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); });
  renderer.canvas.addEventListener('webglcontextrestored', () => renderer.initGL());
}
