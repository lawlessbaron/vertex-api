// Minimal WebGL viewer: flat-shaded meshes over a soft contact shadow.
// Drag to orbit, wheel or pinch to zoom.

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMVP;
varying vec3 vNormal;
void main() {
  vNormal = aNormal;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uColor;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float key = max(dot(n, normalize(vec3(0.5, -0.7, 0.9))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, 0.5, 0.3))), 0.0);
  float sky = 0.5 + 0.5 * n.z;
  vec3 c = uColor * (0.22 + 0.62 * key + 0.2 * fill + 0.14 * sky);
  gl_FragColor = vec4(pow(c, vec3(0.95)), 1.0);
}`;

const SHADOW_VERT = `
attribute vec2 aCorner;
uniform mat4 uMVP;
uniform vec4 uRect;
uniform float uZ;
varying vec2 vUV;
void main() {
  vUV = aCorner;
  gl_Position = uMVP * vec4(uRect.xy + aCorner * uRect.zw, uZ, 1.0);
}`;

const SHADOW_FRAG = `
precision mediump float;
uniform float uStrength;
varying vec2 vUV;
void main() {
  float r = length(vUV);
  gl_FragColor = vec4(0.0, 0.0, 0.0, uStrength * (1.0 - smoothstep(0.35, 1.0, r)));
}`;

// Outlines: the model's creases and open edges, pulled a hair towards the eye so they sit on the faces.
const LINE_VERT = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;
const LINE_FRAG = `
precision mediump float;
uniform vec4 uColor;
void main() { gl_FragColor = uColor; }`;

/** The edges worth drawing: where faces meet at more than `angle` degrees, or a face has no neighbour. Flat [x,y,z, x,y,z, ...]. */
export function featureEdges(mesh, angle = 25) {
  const p = mesh.positions, ix = mesh.indices, ids = new Map(), edges = new Map(), lim = Math.cos((angle * Math.PI) / 180);
  const vid = (i) => { const k = `${Math.round(p[3 * i] * 200)},${Math.round(p[3 * i + 1] * 200)},${Math.round(p[3 * i + 2] * 200)}`; let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
  for (let t = 0; t < ix.length; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
    const u = [p[3 * b] - p[3 * a], p[3 * b + 1] - p[3 * a + 1], p[3 * b + 2] - p[3 * a + 2]], w = [p[3 * c] - p[3 * a], p[3 * c + 1] - p[3 * a + 1], p[3 * c + 2] - p[3 * a + 2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(...n); if (!l) continue; n = n.map((x) => x / l);
    const vs = [vid(a), vid(b), vid(c)], raw = [a, b, c];
    for (let e = 0; e < 3; e++) {
      const i = vs[e], j = vs[(e + 1) % 3], k = i < j ? `${i}_${j}` : `${j}_${i}`, hit = edges.get(k);
      if (hit) { hit.n2 = hit.n2 || n; hit.count++; } else edges.set(k, { a: raw[e], b: raw[(e + 1) % 3], n1: n, n2: null, count: 1 });
    }
  }
  const out = [];
  for (const e of edges.values()) {
    if (e.count === 2 && e.n1[0] * e.n2[0] + e.n1[1] * e.n2[1] + e.n1[2] * e.n2[2] > lim) continue;
    out.push(p[3 * e.a], p[3 * e.a + 1], p[3 * e.a + 2], p[3 * e.b], p[3 * e.b + 1], p[3 * e.b + 2]);
  }
  return new Float32Array(out);
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

function lookAt(eye, target, up) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VIEWS = {
  iso: [-Math.PI / 3, 1.0],
  front: [-Math.PI / 2, 1.35],
  top: [-Math.PI / 2, 0.05],
  side: [0, 1.35],
  under: [-Math.PI / 3, Math.PI - 0.9],
};

export class Viewer {
  constructor(canvas, { interactive = true, preserveDrawingBuffer = false } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, preserveDrawingBuffer });
    if (!gl) throw new Error('WebGL is not available in this browser');
    this.gl = gl;
    this.program = this.#program(VERT, FRAG);
    this.shadowProgram = this.#program(SHADOW_VERT, SHADOW_FRAG);
    this.lineProgram = this.#program(LINE_VERT, LINE_FRAG);
    this.edges = false; // outline the model's edges (setEdges)
    this.shadowBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    this.items = [];
    this.bounds = null;
    [this.theta, this.phi] = VIEWS.iso;
    this.distance = 200;
    this.target = [0, 0, 0];
    this.color = [0.96, 0.55, 0.16];
    this.spinning = false;
    if (interactive) this.#bindControls();
    new ResizeObserver(() => this.render()).observe(canvas);
  }

  #program(vs, fs) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  }

  // Drag to turn. Right-drag, Shift- or Ctrl-drag, or two fingers to pan.
  // Scroll or pinch to zoom. Double-click or double-tap to fit it again.
  #bindControls() {
    const c = this.canvas;
    const pointers = new Map();
    let pinch = 0, mid = null, panning = false, lastTap = 0;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      // A page can claim a press first (to pick and drag something in the model).
      if (this.picker && pointers.size === 0 && this.picker(e)) return;
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      panning = e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey || e.metaKey;
      this.spin(false);
      this.onInteract?.();
      if (e.pointerType === 'touch' && pointers.size === 1) {
        const now = performance.now();
        if (now - lastTap < 300) this.reset();
        lastTap = now;
      }
    });
    const end = (e) => { pointers.delete(e.pointerId); pinch = 0; mid = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => this.reset());
    c.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const [px, py] = pointers.get(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch) this.#zoom(pinch / d);
        if (mid) this.pan(m[0] - mid[0], m[1] - mid[1]);
        pinch = d; mid = m;
        return;
      }
      if (panning) { this.pan(e.clientX - px, e.clientY - py); return; }
      this.theta -= (e.clientX - px) * 0.01;
      this.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.phi - (e.clientY - py) * 0.01));
      this.render();
    });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.#zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
  }

  /** Slides the view by a drag of dx, dy pixels, so the model follows the pointer. */
  pan(dx, dy) {
    const h = Math.max(1, this.canvas.clientHeight), perPx = (2 * this.distance * Math.tan(0.35)) / h;
    const eye = [Math.sin(this.phi) * Math.cos(this.theta), Math.sin(this.phi) * Math.sin(this.theta), Math.cos(this.phi)];
    const fwd = eye.map((v) => -v), right = [fwd[1], -fwd[0], 0], rl = Math.hypot(...right) || 1;
    const r = right.map((v) => v / rl), up = [r[1] * fwd[2] - r[2] * fwd[1], r[2] * fwd[0] - r[0] * fwd[2], r[0] * fwd[1] - r[1] * fwd[0]];
    this.target = this.target.map((v, k) => v - r[k] * dx * perPx + up[k] * dy * perPx);
    this.render();
  }

  /** Back to the whole model in view, from the current angle. */
  reset() { this.fit(); this.render(); }

  #zoom(factor) {
    this.distance = Math.min(3000, Math.max(20, this.distance * factor));
    this.render();
  }

  // items: [{ mesh, color: [r, g, b] }]; color defaults to the viewer colour.
  setScene(items, { refit = true } = {}) {
    const gl = this.gl;
    for (const it of this.items) { gl.deleteBuffer(it.buffer); if (it.lines) gl.deleteBuffer(it.lines); }
    this.scene = items;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    this.items = items.map(({ mesh, color }) => {
      const b = mesh.bounds();
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], b.min[k]);
        max[k] = Math.max(max[k], b.max[k]);
      }
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, flatten(mesh), gl.STATIC_DRAW);
      const out = { buffer, count: mesh.indices.length, color };
      if (this.edges) { const seg = featureEdges(mesh); out.lines = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, out.lines); gl.bufferData(gl.ARRAY_BUFFER, seg, gl.STATIC_DRAW); out.lineCount = seg.length / 3; }
      return out;
    });
    this.bounds = { min, max };
    if (refit) this.fit();
    this.render();
  }

  // The ray from the camera through a point on the screen: { origin, dir }.
  rayAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((clientY - r.top) / r.height) * 2;
    const eye = [
      this.target[0] + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.target[1] + this.distance * Math.sin(this.phi) * Math.sin(this.theta),
      this.target[2] + this.distance * Math.cos(this.phi),
    ];
    const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const fwd = norm(this.target.map((v, i) => v - eye[i]));
    const right = norm(cross(fwd, [0, 0, 1]));
    const up = cross(right, fwd);
    const t = Math.tan(0.35), aspect = r.width / Math.max(1, r.height); // half the 0.7 rad field of view
    return { origin: eye, dir: norm(fwd.map((v, i) => v + right[i] * nx * t * aspect + up[i] * ny * t)) };
  }

  // Where a screen point lands on the flat plane at height z, or null if it misses.
  pointOnPlane(clientX, clientY, z) {
    const { origin, dir } = this.rayAt(clientX, clientY);
    if (Math.abs(dir[2]) < 1e-6) return null;
    const k = (z - origin[2]) / dir[2];
    return k > 0 ? [origin[0] + dir[0] * k, origin[1] + dir[1] * k] : null;
  }

  /** Draw the model's edges as fine dark lines, for a clear outline. */
  setEdges(on = true) { this.edges = Boolean(on); if (this.scene) this.setScene(this.scene, { refit: false }); }

  setMesh(mesh, opts) {
    this.setScene([{ mesh }], opts);
  }

  setColor(rgb) {
    this.color = rgb;
    this.render();
  }

  fit() {
    if (!this.bounds) return;
    const { min, max } = this.bounds;
    this.target = min.map((v, k) => (v + max[k]) / 2);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.distance = (Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * 1.55) / Math.min(1, aspect);
  }

  setView(name) {
    [this.theta, this.phi] = VIEWS[name] || VIEWS.iso;
    this.fit();
    this.render();
  }

  spin(on = true) {
    if (on === this.spinning) return;
    this.spinning = on;
    // A slow turn reads as smooth at 30 frames a second, and costs half the drawing of 60.
    let last = performance.now(), drawn = 0;
    const tick = (now) => {
      if (!this.spinning) return;
      if (now - drawn >= 32) { this.theta += (now - last) * 0.00025; last = now; drawn = now; this.render(); }
      requestAnimationFrame(tick);
    };
    if (on) requestAnimationFrame(tick);
  }

  render() {
    const gl = this.gl;
    const c = this.canvas;
    // Sharp on any screen, but never more than about 1.6 million pixels a frame (a big, high-density
    // monitor would otherwise draw several times that, with antialiasing on top).
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const area = c.clientWidth * c.clientHeight;
    if (area * dpr * dpr > 1.6e6) dpr = Math.max(0.75, Math.sqrt(1.6e6 / Math.max(1, area)));
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.items.length) return;
    const eye = [
      this.target[0] + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.target[1] + this.distance * Math.sin(this.phi) * Math.sin(this.theta),
      this.target[2] + this.distance * Math.cos(this.phi),
    ];
    const mvp = new Float32Array(
      multiply(perspective(0.7, w / h, this.distance / 50, this.distance * 10), lookAt(eye, this.target, [0, 0, 1])),
    );

    // Contact shadow under the model.
    const { min, max } = this.bounds;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const sp = this.shadowProgram;
    gl.useProgram(sp);
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, 'uMVP'), false, mvp);
    gl.uniform4f(
      gl.getUniformLocation(sp, 'uRect'),
      (min[0] + max[0]) / 2, (min[1] + max[1]) / 2,
      (max[0] - min[0]) * 0.75 + 6, (max[1] - min[1]) * 0.75 + 6,
    );
    gl.uniform1f(gl.getUniformLocation(sp, 'uZ'), min[2] - 0.05);
    gl.uniform1f(gl.getUniformLocation(sp, 'uStrength'), 0.28);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuffer);
    const corner = gl.getAttribLocation(sp, 'aCorner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(corner);
    gl.disable(gl.BLEND);

    gl.enable(gl.DEPTH_TEST);
    const p = this.program;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uMVP'), false, mvp);
    const pos = gl.getAttribLocation(p, 'aPos');
    const nrm = gl.getAttribLocation(p, 'aNormal');
    gl.enableVertexAttribArray(pos);
    gl.enableVertexAttribArray(nrm);
    // Faces a hair further back, so the outline wins on its own faces but never
    // shows through anything in front (like the feet through the floor).
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 2);
    for (const it of this.items) {
      gl.uniform3fv(gl.getUniformLocation(p, 'uColor'), it.color || this.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, it.buffer);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(nrm, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, it.count);
    }
    gl.disableVertexAttribArray(pos);
    gl.disableVertexAttribArray(nrm);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    if (this.items.some((it) => it.lines)) {
      const lp = this.lineProgram;
      gl.useProgram(lp);
      gl.uniformMatrix4fv(gl.getUniformLocation(lp, 'uMVP'), false, mvp);
      gl.uniform4f(gl.getUniformLocation(lp, 'uColor'), 0.08, 0.1, 0.11, 0.9);
      const lpos = gl.getAttribLocation(lp, 'aPos');
      gl.enableVertexAttribArray(lpos);
      for (const it of this.items) if (it.lines) { gl.bindBuffer(gl.ARRAY_BUFFER, it.lines); gl.vertexAttribPointer(lpos, 3, gl.FLOAT, false, 12, 0); gl.drawArrays(gl.LINES, 0, it.lineCount); }
      gl.disableVertexAttribArray(lpos);
    }
  }
}

// Expand an indexed mesh into per-face vertices with flat normals.
export function flatten(mesh) {
  const p = mesh.positions;
  const ix = mesh.indices;
  const data = new Float32Array((ix.length / 3) * 18);
  let o = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    // Unit length here: a big face's raw cross product (twice its area) overflows
    // the half-precision floats phone GPUs use, and the face renders flat white.
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const i of [a, b, c]) {
      data[o++] = p[i]; data[o++] = p[i + 1]; data[o++] = p[i + 2];
      data[o++] = nx; data[o++] = ny; data[o++] = nz;
    }
  }
  return data;
}
