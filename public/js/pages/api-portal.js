// api.mintmotive.com.au: the developer portal. A console that types real calls
// and builds the model each one makes, bento tiles that show the API working
// (measured build times, file sizes, serials), and a playground that writes
// the exact call for the model on screen.

const BASE = 'https://api.mintmotive.com.au';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- syntax colours ----------
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const KW = {
  js: new Set(['const', 'let', 'await', 'async', 'new', 'return', 'import', 'from', 'method', 'if']),
  py: new Set(['import', 'from', 'as', 'def', 'return', 'if', 'with', 'open']),
  curl: new Set([]),
  json: new Set([]),
};
const LIT = new Set(['true', 'false', 'null', 'True', 'False', 'None']);
export function highlight(code, lang = 'js') {
  const re = /((?:^|(?<=\s))\/\/[^\n]*|(?<=\s)#[^\n{]*$)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|((?:^|(?<=\s))--?[A-Za-z][\w-]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\$)/gm;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [t, com, str, flag, num, word, dollar] = m;
    const after = code.slice(re.lastIndex);
    if (com && lang !== 'json' && (lang === 'py' ? com.startsWith('#') : com.startsWith('//'))) out += `<span class="c">${esc(com)}</span>`;
    else if (com) out += esc(com);
    else if (str) {
      // A shell string holding JSON is coloured as JSON.
      if (lang === 'curl' && str.startsWith("'") && /^'\s*[{[]/.test(str)) out += `'${highlight(str.slice(1, -1), 'json')}'`;
      else out += `<span class="${/^\s*:/.test(after) && str[0] === '"' ? 'p' : 's'}">${esc(str)}</span>`;
    } else if (flag && lang === 'curl') out += `<span class="g">${esc(flag)}</span>`;
    else if (flag) out += esc(flag);
    else if (num) out += `<span class="n">${num}</span>`;
    else if (word) {
      if (LIT.has(word)) out += `<span class="n">${word}</span>`;
      else if (KW[lang]?.has(word)) out += `<span class="k">${word}</span>`;
      else if (word === 'curl' || /^\s*\(/.test(after)) out += `<span class="f">${word}</span>`;
      else if ((lang === 'js' && /^\s*:/.test(after)) || (lang === 'py' && /^\s*=(?!=)/.test(after))) out += `<span class="p">${word}</span>`;
      else out += esc(word);
    } else if (dollar) out += '<span class="k">$</span>';
    else out += esc(t);
    last = re.lastIndex;
  }
  return out + esc(code.slice(last));
}

// ---------- calls, in three languages ----------
function callFor(body, lang, file = `${body.kind}.${body.format || '3mf'}`) {
  const pretty = (ind) => JSON.stringify(body, null, 2).replace(/\n/g, `\n${ind}`);
  if (lang === 'js') return `const res = await fetch("${BASE}/engine/v1/generate", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.MINT_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${pretty('  ')}),
});
// The file, and its serial number
const file = Buffer.from(await res.arrayBuffer());
console.log(res.headers.get("x-vertex-serial"));`;
  if (lang === 'py') return `import os, requests

key = os.environ["MINT_KEY"]
r = requests.post(
    "${BASE}/engine/v1/generate",
    headers={"Authorization": f"Bearer {key}"},
    json=${pretty('    ').replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False')},
)
open("${file}", "wb").write(r.content)
print(r.headers["X-Vertex-Serial"])  # traceable`;
  return `curl -X POST ${BASE}/engine/v1/generate \\
  -H "Authorization: Bearer $MINT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${pretty('  ')}' \\
  -o ${file}`;
}

// ---------- models ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// The model colours follow the colourway (CSS --model-1 and --model-2).
const cssColour = (name, fallback) => { const v = getComputedStyle(document.body).getPropertyValue(name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; };
const colours = () => [hex(cssColour('--model-1', '#9ec4b5')), hex(cssColour('--model-2', '#d9c09a'))];
const scenes = new Set(); // every viewer and what it shows, to repaint on a colour change
function show(view, items) { if (!view) return; view.setScene(items); scenes.add(view); view._items = items; }
function repaint() { const [a, b] = colours(); for (const v of scenes) { v._items.forEach((it, i) => { it.color = i === 0 ? a : b; }); v.setScene(v._items, { refit: false }); } }
// Parts side by side, so a split baseplate shows every tile.
function layout(list) {
  let x = 0;
  const [a, b] = colours();
  return list.slice(0, 12).map((p, i) => {
    const m = p.mesh, box = m.bounds();
    m.translate(x - box.min[0], -(box.min[1] + box.max[1]) / 2, -box.min[2]);
    x += box.size[0] + 8;
    return { mesh: m, color: i === 0 ? a : b };
  });
}
function timedBuild(kind, params) {
  const t0 = performance.now();
  const list = (buildParts && buildParts(kind, params)) || [];
  return { list, ms: performance.now() - t0, tris: list.reduce((n, p) => n + p.mesh.triangleCount, 0) };
}
const kb = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const rnd = (n) => Array.from({ length: n }, () => CROCK[(Math.random() * 32) | 0]).join('');
const now = new Date();
const serial = () => `VX-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${rnd(4)}-${rnd(4)}`;

// The 3D viewer and the geometry engine (~250 KB) load only on pages that draw a
// model, and only once something asks: every other page (docs, sign-in, status)
// paints without them, and the homepage paints before they arrive.
let Viewer = null, buildParts = null, ready = null;
const engineReady = () => (ready ||= Promise.all([
  import('/js/viewer.js').then((m) => { Viewer = m.Viewer; }),
  import('/js/models.js').then((m) => { buildParts = m.buildParts; }),
]).catch(() => {}));
function makeViewer(canvas, opts) {
  try { const v = new Viewer(canvas, opts); v.setView('iso'); return v; } catch { return null; }
}

// ---------- tiles that react to builds ----------
let engineVersion = '';
const spark = [];
function recordBuild(kind, ms, tris) {
  $$('[data-kinds] li').forEach((li) => li.classList.toggle('is-on', li.dataset.kind === kind));
  const msEl = $('[data-ms]');
  if (msEl) msEl.textContent = ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
  spark.push(ms); if (spark.length > 14) spark.shift();
  const max = Math.max(...spark, 1);
  $('[data-spark]')?.setAttribute('points', spark.map((v, i) => `${(i / Math.max(1, spark.length - 1)) * 120},${30 - (v / max) * 26}`).join(' '));
  const stl = $('[data-stl]');
  if (stl) stl.textContent = `One part at a time · this ${kind}: ${kb(84 + 50 * tris)}`;
}

// ---------- the hero console ----------
const EXAMPLES = [
  { kind: 'bin', params: { gridX: 3, gridY: 2, heightUnits: 6, divisionsX: 3 } },
  { kind: 'baseplate', params: { gridX: 5, gridY: 4 } },
  { kind: 'skadis', params: { item: 'shelf' } },
  { kind: 'holder', params: { gridX: 2, gridY: 2, item: 'aa' } },
  { kind: 'labels', params: {} },
];
async function console_() {
  const out = $('[data-type]'), tag = $('[data-hero-tag]');
  if (!out) return;
  await engineReady();
  const view = Viewer ? makeViewer($('[data-hero-view]'), { interactive: false }) : null;
  if (view && !still) view.spin(true);
  for (let n = 0; ; n = (n + 1) % EXAMPLES.length) {
    const ex = EXAMPLES[n];
    const body = { kind: ex.kind, params: ex.params };
    const cmd = `$ curl -X POST ${BASE}/engine/v1/generate \\\n    -H "Authorization: Bearer $MINT_KEY" \\\n    -d '${JSON.stringify(body)}' \\\n    -o ${ex.kind}.3mf`;
    if (still) out.innerHTML = highlight(cmd, 'curl');
    else for (let i = 0; i <= cmd.length; i += 2) { out.innerHTML = highlight(cmd.slice(0, i), 'curl'); await sleep(14); }
    const { list, ms, tris } = timedBuild(ex.kind, ex.params);
    await sleep(still ? 0 : 260);
    const head = [
      ['content-type', 'model/3mf'],
      ['x-vertex-serial', serial()],
      ['x-vertex-engine', engineVersion || '—'],
      ['x-vertex-parts', list.map((p) => p.name).slice(0, 3).join(', ') + (list.length > 3 ? ', …' : '')],
    ];
    let resp = `\n\n<span class="ok">HTTP/2 200 OK</span>`;
    out.innerHTML = highlight(cmd, 'curl') + resp;
    for (const [k, v] of head) { await sleep(still ? 0 : 110); resp += `\n<span class="p">${k}:</span> <span class="s">${esc(v)}</span>`; out.innerHTML = highlight(cmd, 'curl') + resp; }
    resp += `\n<span class="c">  ✓ ${ex.kind}.3mf · ${tris.toLocaleString()} triangles · built in ${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms</span>`;
    out.innerHTML = highlight(cmd, 'curl') + resp;
    show(view, layout(list));
    if (tag) tag.textContent = `${ex.kind} · ${list.length} part${list.length === 1 ? '' : 's'}`;
    recordBuild(ex.kind, ms, tris);
    if (still) return;
    await sleep(4200);
  }
}

// ---------- bento: code tile, serials, counters ----------
function codeTile() {
  const el = $('[data-snippet]');
  if (!el) return;
  const body = { kind: 'bin', format: '3mf', params: { gridX: 3, gridY: 2, heightUnits: 6 } };
  let lang = 'curl', auto = !still;
  const show = (l) => { lang = l; el.innerHTML = highlight(callFor(body, l), l); $$('[data-lang]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.lang === l))); };
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => { auto = false; show(b.dataset.lang); }));
  show('curl');
  setInterval(() => { if (auto && !document.hidden) show({ curl: 'js', js: 'py', py: 'curl' }[lang]); }, 5200);
}
function serials() {
  const ul = $('[data-serials]');
  if (!ul) return;
  const kinds = ['bin', 'baseplate', 'holder', 'skadis', 'labels', 'morph', 'enclosure', 'simrig', 'tslot', 'swatch', 'spool', 'knob', 'dragchain', 'hinge', 'jar', 'stand', 'deskhook', 'planter', 'cutter', 'keychain', 'bagclip', 'coaster', 'cablewrap', 'battery', 'shelfbracket', 'headphone', 'keyrack', 'plantmarker', 'toothbrush', 'spicerack', 'broomholder', 'bookend', 'laptopstand', 'monitorriser', 'desktidy', 'cablebox', 'chargedock', 'deskdrawer', 'deskhanger', 'controllerrack', 'grommet', 'serverrack', 'leadhanger', 'bikehook', 'shoerack', 'petbowl', 'routershelf', 'remotecaddy', 'tabletholder', 'glassesrack', 'familycharger', 'hairholder', 'lidrack', 'mughooks', 'wraprack', 'glassrail'];
  const add = () => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${serial()}</b><span>${kinds[(Math.random() * kinds.length) | 0]}.3mf</span>`;
    ul.prepend(li);
    while (ul.children.length > 4) ul.lastElementChild.remove();
  };
  for (let i = 0; i < 4; i++) add();
  if (!still) setInterval(() => { if (!document.hidden) add(); }, 1700);
}
function countUp(el) {
  const to = Number(el.dataset.count);
  if (still) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 1600), e = 1 - (1 - k) ** 3; el.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- reveal on scroll, and the cursor spotlight ----------
function reveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      e.target.classList.add('is-in');
      e.target.querySelectorAll('[data-count]').forEach(countUp);
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('.ax-reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });
}
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest?.('.ax-tile');
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty('--mx', `${e.clientX - r.left}px`);
  t.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });
// The hero's grid lights up round the cursor.
const hero = $('[data-hero]');
hero?.addEventListener('pointermove', (e) => {
  const r = hero.getBoundingClientRect();
  hero.style.setProperty('--hx', `${e.clientX - r.left}px`);
  hero.style.setProperty('--hy', `${e.clientY - r.top}px`);
}, { passive: true });

// ---------- the playground ----------
const FIELDS = {
  bin: [['gridX', 'Width (units)', 1, 8, 3, 0.5], ['gridY', 'Depth (units)', 1, 8, 2, 0.5], ['heightUnits', 'Height (7 mm steps)', 2, 15, 6, 1], ['divisionsX', 'Compartments across', 1, 6, 3, 1]],
  baseplate: [['gridX', 'Width (units)', 1, 12, 6, 1], ['gridY', 'Depth (units)', 1, 12, 4, 1], ['bed', 'Print bed (mm)', 180, 350, 256, 1]],
  holder: [['gridX', 'Width (units)', 1, 6, 2, 1], ['gridY', 'Depth (units)', 1, 6, 2, 1]],
  skadis: [['pitchX', 'Hole spacing (mm)', 20, 60, 40, 1]],
};
const EXTRA = { skadis: { item: 'shelf' }, holder: { item: 'aa' } };
async function playground() {
  const form = $('[data-form]');
  if (!form || !$('[data-fields]')) return; // other pages have their own [data-form]
  const fields = $('[data-fields]'), codeEl = $('[data-code]'), partsEl = $('[data-parts]');
  let tab = 'curl', view = null, timer;
  const renderFields = (kind) => {
    fields.innerHTML = FIELDS[kind].map(([k, label, min, max, val, step]) => `<label>${label} <output data-out="${k}">${val}</output><input type="range" name="${k}" min="${min}" max="${max}" step="${step}" value="${val}" /></label>`).join('');
  };
  const params = () => { const kind = form.kind.value, p = { ...(EXTRA[kind] || {}) }; for (const [k] of FIELDS[kind]) p[k] = Number(form[k].value); return p; };
  const update = (rebuild = true) => {
    for (const o of $$('[data-out]', fields)) o.textContent = form[o.dataset.out].value;
    const kind = form.kind.value;
    codeEl.innerHTML = highlight(callFor({ kind, format: form.format.value, params: params() }, tab), tab);
    if (!rebuild) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const { list, ms, tris } = timedBuild(kind, params());
        partsEl.textContent = `${list.length} part${list.length === 1 ? '' : 's'} · ${tris.toLocaleString()} triangles · ${Math.round(ms)} ms`;
        show(view, layout(list));
        recordBuild(kind, ms, tris);
      } catch (e) { partsEl.textContent = `The engine refused those settings: ${e.message}`; }
    }, 120);
  };
  form.addEventListener('input', (e) => { if (e.target.name === 'kind') renderFields(form.kind.value); update(e.target.name !== 'format'); });
  $$('[data-ptab]').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.ptab;
    $$('[data-ptab]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
    update(false);
  }));
  $('[data-copy]')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(codeEl.textContent); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = 'Select to copy'; }
    setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
  });
  renderFields('bin');
  update(false);
  await engineReady();
  if (Viewer) view = makeViewer($('[data-view]'));
  update();
}

// ---------- engine status ----------
fetch('/api/engine/v1').then((r) => r.json()).then((info) => {
  engineVersion = info.engine || '';
  const text = info.enabled ? 'Live' : 'Opening soon';
  const set = (sel, t) => { const el = $(sel); if (el) el.textContent = t; };
  set('[data-state]', `Engine ${info.engine} · ${text.toLowerCase()}`);
  set('[data-state2]', info.enabled ? 'Live: keys work now' : 'Opening soon: make a key now');
  set('[data-ver]', `v${info.engine}`);
  for (const d of $$('[data-dot], [data-dot2]')) d.classList.toggle('is-on', Boolean(info.enabled));
}).catch(() => { const el = $('[data-state]'); if (el) el.textContent = 'Engine status unavailable'; });


// ---------- the living background ----------
// A network that learns: nodes drift and link when close, light pulses run
// along the links and make the nodes they reach flash; streams of code drift
// up behind it. Colours follow the colourway; it rests when the tab is hidden.
function background() {
  const cv = $('[data-net]');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W = 0, H = 0, nodes = [], streams = [], pulses = [];
  const mouse = { x: -1e4, y: -1e4 };
  const WORDS = ['POST /engine/v1/generate', '"gridX": 3', '"heightUnits": 6', 'mesh.triangles', 'x-vertex-serial', 'epoch++', 'loss.backward()', 'weights.update()', 'outline → mm', 'grad ∇ 0.0031', 'buildParts(kind)', 'toSTL(mesh)', 'serial: VX-2610', '"kind": "bin"', 'learn(correction)', 'fit(photo, paper)', 'return file', 'tiles.map(clip)', 'pocket.grow(0.4)', 'accuracy ↑'];
  const COLS = ['--c-fn', '--c-str', '--c-prop', '--c-kw', '--c-num'];
  const col = (name, fb) => getComputedStyle(document.body).getPropertyValue(name).trim() || fb;
  let pal = {};
  const readPal = () => { pal = { a: col('--mint', '#9ec4b5'), b: col('--accent-3', '#49d8ff'), code: COLS.map((c) => col(c, '#888')) }; };
  function size() {
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, (W * H) / 16000));
    nodes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, r: 1 + Math.random() * 1.6, glow: 0 }));
    const sc = Math.round(W / 150);
    streams = Array.from({ length: sc }, (_, i) => ({ x: (i + .5) * (W / sc) + (Math.random() - .5) * 60, y: Math.random() * H, v: .12 + Math.random() * .22, lines: Array.from({ length: 6 + ((Math.random() * 6) | 0) }, () => ({ t: WORDS[(Math.random() * WORDS.length) | 0], c: (Math.random() * COLS.length) | 0 })) }));
  }
  const LINK = 150;
  function frame(still) {
    ctx.clearRect(0, 0, W, H);
    // Code, drifting up
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const s of streams) {
      if (!still) { s.y -= s.v; if (s.y < -s.lines.length * 22) { s.y = H + 20; } }
      s.lines.forEach((l, i) => {
        const y = s.y + i * 22;
        if (y < -20 || y > H + 20) return;
        const edge = Math.min(1, y / (H * .25), (H - y) / (H * .25));
        ctx.globalAlpha = Math.max(0, .09 * edge);
        ctx.fillStyle = pal.code[l.c];
        ctx.fillText(l.t, s.x, y);
      });
    }
    // The network
    for (const n of nodes) {
      if (!still) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = W + 20; if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; if (n.y > H + 20) n.y = -20;
        const dx = mouse.x - n.x, dy = mouse.y - n.y, d = Math.hypot(dx, dy);
        if (d < 220) { n.x += dx * .0016; n.y += dy * .0016; }
        n.glow *= .96;
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > LINK) continue;
      const near = Math.max(0, 1 - Math.hypot((a.x + b.x) / 2 - mouse.x, (a.y + b.y) / 2 - mouse.y) / 260);
      ctx.globalAlpha = (1 - d / LINK) * (.13 + near * .35);
      ctx.strokeStyle = pal.a;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Pulses: signals running along the links
    if (!still && pulses.length < 9 && Math.random() < .08) {
      const a = nodes[(Math.random() * nodes.length) | 0];
      const near = nodes.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < LINK);
      if (near.length) pulses.push({ a, b: near[(Math.random() * near.length) | 0], t: 0, hops: 2 + ((Math.random() * 4) | 0) });
    }
    pulses = pulses.filter((p) => {
      p.t += .018;
      if (p.t >= 1) {
        p.b.glow = 1;
        if (--p.hops <= 0) return false;
        const near = nodes.filter((c) => c !== p.b && c !== p.a && Math.hypot(p.b.x - c.x, p.b.y - c.y) < LINK);
        if (!near.length) return false;
        p.a = p.b; p.b = near[(Math.random() * near.length) | 0]; p.t = 0;
      }
      const x = p.a.x + (p.b.x - p.a.x) * p.t, y = p.a.y + (p.b.y - p.a.y) * p.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
      g.addColorStop(0, pal.b); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = .85; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .5; ctx.strokeStyle = pal.b; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.a.x, p.a.y); ctx.lineTo(x, y); ctx.stroke(); ctx.lineWidth = 1;
      return true;
    });
    for (const n of nodes) {
      const r = n.r + n.glow * 2.5;
      if (n.glow > .05) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 18 * n.glow + 4);
        g.addColorStop(0, pal.b); g.addColorStop(1, 'transparent');
        ctx.globalAlpha = .6 * n.glow; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(n.x, n.y, 18 * n.glow + 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = .55 + n.glow * .45; ctx.fillStyle = n.glow > .2 ? pal.b : pal.a;
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  readPal(); size();
  addEventListener('resize', () => { size(); if (still) frame(true); });
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener('ax-palette', () => { readPal(); if (still) frame(true); });
  if (still) { frame(true); return; }
  const loop = () => { if (!document.hidden) frame(false); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// ---------- colourways ----------
function palettes() {
  const set = (name, save) => {
    if (name === 'mint') delete document.body.dataset.palette; else document.body.dataset.palette = name;
    $$('.ax-swatches [data-palette]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.palette === name)));
    if (save) try { localStorage.setItem('ax-palette', name); } catch { /* private window */ }
    repaint();
    document.dispatchEvent(new Event('ax-palette'));
  };
  $$('.ax-swatches [data-palette]').forEach((b) => b.addEventListener('click', () => set(b.dataset.palette, true)));
  let saved = null;
  try { saved = new URLSearchParams(location.search).get('palette') || localStorage.getItem('ax-palette'); } catch { /* ignore */ }
  if (saved && document.querySelector(`.ax-swatches [data-palette="${saved}"]`)) set(saved, false);
}

palettes();
background();
$$('.ax-stats [data-count]').forEach(countUp);
reveal();
codeTile();
serials();
playground();
console_();

// Pricing: the plans as they're set in the API admin.
(async () => {
  const box = document.querySelector('[data-plans]');
  if (!box) return;
  try {
    const r = await (await fetch('/api/engine/v1/plans', { headers: { Accept: 'application/json' } })).json();
    if (!r.plans?.length) return;
    // The free tile follows the free plan as it's set in admin.
    const free = r.plans.find((p) => !p.monthly && !p.invite);
    if (free) {
      const day = document.querySelector('[data-free-day]'), line = document.querySelector('[data-free-line]');
      if (day) { day.dataset.count = free.perDay; day.textContent = Number(free.perDay).toLocaleString('en-AU'); }
      if (line) line.textContent = `For your whole account. ${free.perMinute} a minute per key, up to ${free.keys} keys.`;
    }
    const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const n = (x) => Number(x).toLocaleString('en-AU');
    box.innerHTML = r.plans.map((p, i) => `
      <article class="ax-tile ax-plan${i === 1 ? ' ax-plan-hot' : ''}">
        <h3>${e(p.name)}</h3>
        <p class="ax-price">${p.monthly ? `$${n(p.monthly)}<small>/month</small>` : 'Free'}</p>
        <p class="ax-blurb">${e(p.blurb)}</p>
        <ul class="ax-ticks">${[`${n(p.perDay)} calls a day`, `${n(p.perMinute)} a minute`, `Up to ${n(p.keys)} keys`, ...p.perks].map((t) => `<li>${e(t)}</li>`).join('')}</ul>
        ${p.invite ? `<a class="ax-btn ax-btn-ghost" href="/education">Apply for ${e(p.name)}</a>` : `<a class="ax-btn ${i === 1 ? 'ax-btn-primary' : 'ax-btn-ghost'}" href="/console">${p.monthly ? (r.paid ? `Choose ${e(p.name)}` : 'Opening soon') : 'Get a free key'}</a>`}
      </article>`).join('');
  } catch { /* the free plan stays on the page */ }
})();
