// The public engine API: generate models from your own code. A member makes
// a key on /developers and sends it as "Authorization: Bearer vx_…"; the
// server runs the same geometry the site does and answers with an STL, 3MF
// or OBJ that carries a serial number like any other download.
//
// The whole thing sits behind the engineApi switch (Admin → Site tabs). Off,
// every call answers 503, except with a staff member's key, so it can be
// tried before it opens.
import { randomBytes } from 'node:crypto';
import { HttpError, RateLimiter, readJson } from './security.js';
import { hashToken } from './auth.js';
import { keyHint } from './api-log.js';
import { ipAllowed, parseAllow } from './api-guard.js';
import { buildParts, loadKind, LAZY_KINDS } from '../engine/models.js';
import { toSTL, to3MF, toOBJ } from '../engine/export.js';
import { setSerial } from '../engine/serial.js';
import { Mesh } from '../engine/geometry/mesh.js';
import { ENGINE } from '../engine/engine.js';
import { BIN_DEFAULTS } from '../engine/geometry/bin.js';
import { PLATE_DEFAULTS } from '../engine/geometry/plates.js';
import { HOLDER_DEFAULTS } from '../engine/geometry/holders.js';
import { LABEL_CLIP_DEFAULTS } from '../engine/geometry/labelclip.js';
import { SKADIS_DEFAULTS } from '../engine/geometry/skadis.js';
import { MORPH_DEFAULTS } from '../engine/geometry/morph.js';
import { ENCLOSURE_DEFAULTS } from '../engine/geometry/enclosure.js';
import { SIM_DEFAULTS } from '../engine/geometry/simrig.js';
import { TSLOT_DEFAULTS } from '../engine/geometry/tslot.js';
import { SWATCH_DEFAULTS } from '../engine/geometry/swatch.js';
import { SPOOL_DEFAULTS } from '../engine/geometry/spool.js';
import { KNOB_DEFAULTS } from '../engine/geometry/knob.js';
import { DRAGCHAIN_DEFAULTS } from '../engine/geometry/dragchain.js';
import { HINGE_DEFAULTS } from '../engine/geometry/hinge.js';
import { JAR_DEFAULTS } from '../engine/geometry/jar.js';
import { STAND_DEFAULTS } from '../engine/geometry/stand.js';
import { DESKHOOK_DEFAULTS } from '../engine/geometry/deskhook.js';
import { PLANTER_DEFAULTS } from '../engine/geometry/planter.js';
import { CUTTER_DEFAULTS } from '../engine/geometry/cutter.js';
import { KEYCHAIN_DEFAULTS } from '../engine/geometry/keychain.js';
import { BAGCLIP_DEFAULTS } from '../engine/geometry/bagclip.js';
import { COASTER_DEFAULTS } from '../engine/geometry/coaster.js';
import { CABLEWRAP_DEFAULTS } from '../engine/geometry/cablewrap.js';
import { BATTERY_DEFAULTS } from '../engine/geometry/battery.js';
import { SHELFBRACKET_DEFAULTS } from '../engine/geometry/shelfbracket.js';
import { HEADPHONE_DEFAULTS } from '../engine/geometry/headphone.js';
import { KEYRACK_DEFAULTS } from '../engine/geometry/keyrack.js';
import { PLANTMARKER_DEFAULTS } from '../engine/geometry/plantmarker.js';
import { TOOTHBRUSH_DEFAULTS } from '../engine/geometry/toothbrush.js';
import { SPICERACK_DEFAULTS } from '../engine/geometry/spicerack.js';
import { BROOMHOLDER_DEFAULTS } from '../engine/geometry/broomholder.js';
import { BOOKEND_DEFAULTS } from '../engine/geometry/bookend.js';
import { LAPTOPSTAND_DEFAULTS } from '../engine/geometry/laptopstand.js';
import { MONITORRISER_DEFAULTS } from '../engine/geometry/monitorriser.js';
import { DESKTIDY_DEFAULTS } from '../engine/geometry/desktidy.js';
import { CABLEBOX_DEFAULTS } from '../engine/geometry/cablebox.js';
import { CHARGEDOCK_DEFAULTS } from '../engine/geometry/chargedock.js';
import { DESKDRAWER_DEFAULTS } from '../engine/geometry/deskdrawer.js';
import { DESKHANGER_DEFAULTS } from '../engine/geometry/deskhanger.js';
import { CONTROLLERRACK_DEFAULTS } from '../engine/geometry/controllerrack.js';
import { GROMMET_DEFAULTS } from '../engine/geometry/grommet.js';
import { SERVERRACK_DEFAULTS, RACKPANEL_DEFAULTS } from '../engine/geometry/serverrack.js';
import { LEADHANGER_DEFAULTS } from '../engine/geometry/leadhanger.js';
import { BIKEHOOK_DEFAULTS } from '../engine/geometry/bikehook.js';
import { SHOERACK_DEFAULTS } from '../engine/geometry/shoerack.js';
import { PETBOWL_DEFAULTS } from '../engine/geometry/petbowl.js';
import { ROUTERSHELF_DEFAULTS } from '../engine/geometry/routershelf.js';
import { REMOTECADDY_DEFAULTS } from '../engine/geometry/remotecaddy.js';
import { TABLETHOLDER_DEFAULTS } from '../engine/geometry/tabletholder.js';
import { GLASSESRACK_DEFAULTS } from '../engine/geometry/glassesrack.js';
import { FAMILYCHARGER_DEFAULTS } from '../engine/geometry/familycharger.js';
import { HAIRHOLDER_DEFAULTS } from '../engine/geometry/hairholder.js';
import { LIDRACK_DEFAULTS } from '../engine/geometry/lidrack.js';
import { MUGHOOKS_DEFAULTS } from '../engine/geometry/mughooks.js';
import { WRAPRACK_DEFAULTS } from '../engine/geometry/wraprack.js';
import { GLASSRAIL_DEFAULTS } from '../engine/geometry/glassrail.js';
import { CUTLERYTRAY_DEFAULTS } from '../engine/geometry/cutlerytray.js';
import { HALLHOOKS_DEFAULTS } from '../engine/geometry/hallhooks.js';
import { TOYTRAY_DEFAULTS } from '../engine/geometry/toytray.js';
import { SHOEHORN_DEFAULTS } from '../engine/geometry/shoehorn.js';
import { BATHCADDY_DEFAULTS } from '../engine/geometry/bathcaddy.js';
import { SPOOLRACK_DEFAULTS } from '../engine/geometry/spoolrack.js';
import { PROPAGATOR_DEFAULTS } from '../engine/geometry/propagator.js';
import { GAMEINSERT_DEFAULTS } from '../engine/geometry/gameinsert.js';
import { DICETOWER_DEFAULTS } from '../engine/geometry/dicetower.js';
import { CARDHOLDER_DEFAULTS } from '../engine/geometry/cardholder.js';
import { PILLBOX_DEFAULTS } from '../engine/geometry/pillbox.js';
import { DATECLIP_DEFAULTS } from '../engine/geometry/dateclip.js';
import { MAGNETHOLDER_DEFAULTS } from '../engine/geometry/magnetholder.js';
import { JEWELLERYSTAND_DEFAULTS } from '../engine/geometry/jewellerystand.js';
import { TIERACK_DEFAULTS } from '../engine/geometry/tierack.js';
import { CAPSULEHOLDER_DEFAULTS } from '../engine/geometry/capsuleholder.js';
import { DOORSTOP_DEFAULTS } from '../engine/geometry/doorstop.js';
import { TUBESQUEEZER_DEFAULTS } from '../engine/geometry/tubesqueezer.js';
import { CLOTHESPEG_DEFAULTS } from '../engine/geometry/clothespeg.js';
import { TOWELHOLDER_DEFAULTS } from '../engine/geometry/towelholder.js';
import { SINKTIDY_DEFAULTS } from '../engine/geometry/sinktidy.js';
import { DRYINGRACK_DEFAULTS } from '../engine/geometry/dryingrack.js';
import { SOAPDISH_DEFAULTS } from '../engine/geometry/soapdish.js';
import { EGGTRAY_DEFAULTS } from '../engine/geometry/eggtray.js';
import { KNIFEBLOCK_DEFAULTS } from '../engine/geometry/knifeblock.js';

// The generators the site loads on demand; the API wants them all from the start.
await Promise.all(LAZY_KINDS.map(loadKind));

// What v1 can make: the generators whose parts the site builds from settings.
export const API_KINDS = {
  bin: { name: 'Gridfinity bin', defaults: BIN_DEFAULTS, generator: '/create?type=bin' },
  baseplate: { name: 'Gridfinity baseplate', defaults: PLATE_DEFAULTS, generator: '/create?type=baseplate' },
  holder: { name: 'Gridfinity holder', defaults: HOLDER_DEFAULTS, generator: '/create?type=holder' },
  labels: { name: 'Label clips and extras', defaults: LABEL_CLIP_DEFAULTS, generator: '/create?type=labels' },
  skadis: { name: 'Skådis part', defaults: SKADIS_DEFAULTS, generator: '/skadis' },
  morph: { name: 'Deck Foundry part', defaults: MORPH_DEFAULTS, generator: '/morph' },
  enclosure: { name: 'Pi and Arduino case', defaults: ENCLOSURE_DEFAULTS, generator: '/enclosures' },
  simrig: { name: 'Sim rig part', defaults: SIM_DEFAULTS, generator: '/sim-rig' },
  tslot: { name: 'T-slot part', defaults: TSLOT_DEFAULTS, generator: '/sim-rig?type=tslot' },
  swatch: { name: 'Filament swatches', defaults: SWATCH_DEFAULTS, generator: '/swatches' },
  spool: { name: 'Spool and dry-box part', defaults: SPOOL_DEFAULTS, generator: '/spool-parts' },
  knob: { name: 'Knob or drawer pull', defaults: KNOB_DEFAULTS, generator: '/knobs' },
  dragchain: { name: 'Cable drag chain', defaults: DRAGCHAIN_DEFAULTS, generator: '/drag-chains' },
  hinge: { name: 'Hinge or hinged box', defaults: HINGE_DEFAULTS, generator: '/hinges' },
  jar: { name: 'Screw-top jar', defaults: JAR_DEFAULTS, generator: '/jars' },
  stand: { name: 'Phone or tablet stand', defaults: STAND_DEFAULTS, generator: '/stands' },
  deskhook: { name: 'Desk hook', defaults: DESKHOOK_DEFAULTS, generator: '/desk-hooks' },
  planter: { name: 'Plant pot and drip tray', defaults: PLANTER_DEFAULTS, generator: '/planters' },
  cutter: { name: 'Cookie cutter', defaults: CUTTER_DEFAULTS, generator: '/cookie-cutters' },
  keychain: { name: 'Name keychain or tag', defaults: KEYCHAIN_DEFAULTS, generator: '/keychains' },
  bagclip: { name: 'Bag clip', defaults: BAGCLIP_DEFAULTS, generator: '/bag-clips' },
  coaster: { name: 'Coaster', defaults: COASTER_DEFAULTS, generator: '/coasters' },
  cablewrap: { name: 'Cable wrap or winder', defaults: CABLEWRAP_DEFAULTS, generator: '/cable-wraps' },
  battery: { name: 'Battery organiser', defaults: BATTERY_DEFAULTS, generator: '/battery-organisers' },
  shelfbracket: { name: 'Shelf bracket', defaults: SHELFBRACKET_DEFAULTS, generator: '/shelf-brackets' },
  headphone: { name: 'Headphone stand', defaults: HEADPHONE_DEFAULTS, generator: '/headphone-stands' },
  keyrack: { name: 'Key rack', defaults: KEYRACK_DEFAULTS, generator: '/key-racks' },
  plantmarker: { name: 'Plant markers', defaults: PLANTMARKER_DEFAULTS, generator: '/plant-markers' },
  toothbrush: { name: 'Toothbrush holder', defaults: TOOTHBRUSH_DEFAULTS, generator: '/toothbrush-holders' },
  spicerack: { name: 'Spice rack', defaults: SPICERACK_DEFAULTS, generator: '/spice-racks' },
  broomholder: { name: 'Broom and mop holder', defaults: BROOMHOLDER_DEFAULTS, generator: '/broom-holders' },
  bookend: { name: 'Bookend', defaults: BOOKEND_DEFAULTS, generator: '/bookends' },
  laptopstand: { name: 'Laptop stand', defaults: LAPTOPSTAND_DEFAULTS, generator: '/laptop-stands' },
  monitorriser: { name: 'Monitor riser', defaults: MONITORRISER_DEFAULTS, generator: '/monitor-risers' },
  desktidy: { name: 'Pen pot, card stand or desk tray', defaults: DESKTIDY_DEFAULTS, generator: '/desk-tidies' },
  cablebox: { name: 'Cable box', defaults: CABLEBOX_DEFAULTS, generator: '/cable-boxes' },
  chargedock: { name: 'Charging dock', defaults: CHARGEDOCK_DEFAULTS, generator: '/charging-docks' },
  deskdrawer: { name: 'Under-desk drawer', defaults: DESKDRAWER_DEFAULTS, generator: '/desk-drawers' },
  deskhanger: { name: 'Under-desk headphone hook', defaults: DESKHANGER_DEFAULTS, generator: '/headphone-hooks' },
  controllerrack: { name: 'Controller and headset rack', defaults: CONTROLLERRACK_DEFAULTS, generator: '/controller-racks' },
  grommet: { name: 'Desk cable grommet', defaults: GROMMET_DEFAULTS, generator: '/desk-grommets' },
  serverrack: { name: 'Modular 10-inch server rack', defaults: SERVERRACK_DEFAULTS, generator: '/server-racks' },
  leadhanger: { name: 'Extension lead and hose hanger', defaults: LEADHANGER_DEFAULTS, generator: '/lead-hangers' },
  bikehook: { name: 'Bike and helmet wall hook', defaults: BIKEHOOK_DEFAULTS, generator: '/bike-hooks' },
  shoerack: { name: 'Shoe and boot wall rack', defaults: SHOERACK_DEFAULTS, generator: '/shoe-racks' },
  petbowl: { name: 'Raised pet bowl stand', defaults: PETBOWL_DEFAULTS, generator: '/pet-bowl-stands' },
  routershelf: { name: 'Router and modem wall shelf', defaults: ROUTERSHELF_DEFAULTS, generator: '/router-shelves' },
  remotecaddy: { name: 'Remote control caddy', defaults: REMOTECADDY_DEFAULTS, generator: '/remote-caddies' },
  tabletholder: { name: 'Wall tablet holder', defaults: TABLETHOLDER_DEFAULTS, generator: '/tablet-holders' },
  glassesrack: { name: 'Glasses wall rack', defaults: GLASSESRACK_DEFAULTS, generator: '/glasses-racks' },
  familycharger: { name: 'Family charging station', defaults: FAMILYCHARGER_DEFAULTS, generator: '/family-chargers' },
  hairholder: { name: 'Hair tool holder', defaults: HAIRHOLDER_DEFAULTS, generator: '/hair-tool-holders' },
  lidrack: { name: 'Pot lid rack', defaults: LIDRACK_DEFAULTS, generator: '/kitchen?type=lidrack' },
  mughooks: { name: 'Under-shelf mug hooks', defaults: MUGHOOKS_DEFAULTS, generator: '/kitchen?type=mughooks' },
  wraprack: { name: 'Wrap and foil dispenser', defaults: WRAPRACK_DEFAULTS, generator: '/kitchen?type=wraprack' },
  glassrail: { name: 'Wine glass rail', defaults: GLASSRAIL_DEFAULTS, generator: '/glass-rails' },
  cutlerytray: { name: 'Cutlery drawer organiser', defaults: CUTLERYTRAY_DEFAULTS, generator: '/kitchen?type=cutlerytray' },
  hallhooks: { name: 'Hallway hooks', defaults: HALLHOOKS_DEFAULTS, generator: '/hall-hooks' },
  toytray: { name: 'Toy sorting tray', defaults: TOYTRAY_DEFAULTS, generator: '/toy-trays' },
  shoehorn: { name: 'Shoe horn and boot hooks', defaults: SHOEHORN_DEFAULTS, generator: '/shoe-horns' },
  bathcaddy: { name: 'Bathroom caddy', defaults: BATHCADDY_DEFAULTS, generator: '/bath-caddies' },
  spoolrack: { name: 'Thread spool rack', defaults: SPOOLRACK_DEFAULTS, generator: '/thread-racks' },
  propagator: { name: 'Propagation station', defaults: PROPAGATOR_DEFAULTS, generator: '/propagation-stations' },
  gameinsert: { name: 'Board game insert', defaults: GAMEINSERT_DEFAULTS, generator: '/game-inserts' },
  dicetower: { name: 'Dice tower', defaults: DICETOWER_DEFAULTS, generator: '/dice-towers' },
  cardholder: { name: 'Card holder', defaults: CARDHOLDER_DEFAULTS, generator: '/card-holders' },
  pillbox: { name: 'Pill organiser', defaults: PILLBOX_DEFAULTS, generator: '/pill-organisers' },
  dateclip: { name: 'Dated bag clip', defaults: DATECLIP_DEFAULTS, generator: '/date-clips' },
  magnetholder: { name: 'Fridge magnet holder', defaults: MAGNETHOLDER_DEFAULTS, generator: '/kitchen?type=magnetholder' },
  jewellerystand: { name: 'Jewellery stand', defaults: JEWELLERYSTAND_DEFAULTS, generator: '/jewellery-stands' },
  tierack: { name: 'Tie and belt rack', defaults: TIERACK_DEFAULTS, generator: '/tie-racks' },
  capsuleholder: { name: 'Coffee capsule holder', defaults: CAPSULEHOLDER_DEFAULTS, generator: '/kitchen?type=capsuleholder' },
  doorstop: { name: 'Door wedge and stop', defaults: DOORSTOP_DEFAULTS, generator: '/door-stops' },
  tubesqueezer: { name: 'Tube squeezer', defaults: TUBESQUEEZER_DEFAULTS, generator: '/tube-squeezers' },
  clothespeg: { name: 'Clothes pegs', defaults: CLOTHESPEG_DEFAULTS, generator: '/clothes-pegs' },
  towelholder: { name: 'Paper towel holder', defaults: TOWELHOLDER_DEFAULTS, generator: '/kitchen?type=towelholder' },
  sinktidy: { name: 'Sink tidy', defaults: SINKTIDY_DEFAULTS, generator: '/kitchen?type=sinktidy' },
  dryingrack: { name: 'Bottle drying rack', defaults: DRYINGRACK_DEFAULTS, generator: '/kitchen?type=dryingrack' },
  soapdish: { name: 'Soap dish', defaults: SOAPDISH_DEFAULTS, generator: '/kitchen?type=soapdish' },
  eggtray: { name: 'Egg tray', defaults: EGGTRAY_DEFAULTS, generator: '/kitchen?type=eggtray' },
  knifeblock: { name: 'Knife block', defaults: KNIFEBLOCK_DEFAULTS, generator: '/kitchen?type=knifeblock' },
  rackpanel: { name: '10-inch rack panel', defaults: RACKPANEL_DEFAULTS, generator: '/rack-panels' },
};
export const API_FORMATS = { stl: 'model/stl', '3mf': 'model/3mf', obj: 'model/obj' };
export const API_LIMITS = { perMinute: 30, perDay: 1000, keys: 5 };

// The file a test key gets: a 20 mm cube.
function testCube() {
  const m = new Mesh(), v = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 20], [20, 0, 20], [20, 20, 20], [0, 20, 20]].map(([x, y, z]) => m.addVertex(x, y, z));
  for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) m.addQuad(v[a], v[b], v[c], v[d]);
  return m;
}

export function createEngineApi({ db, controls, analytics, isStaff, newSerial, onKey = () => {}, plans = null, teams = null }) {
  const minute = new RateLimiter(API_LIMITS.perMinute, 60e3);
  const day = new RateLimiter(API_LIMITS.perDay, 86400e3);
  const testMinute = new RateLimiter(20, 60e3);
  const off = () => controls.isOff('engineApi');
  const str = (v, n) => String(v ?? '').trim().slice(0, n);

  // ---------- keys ----------
  const keyOut = (k) => ({ id: k.id, name: k.name, test: Boolean(k.sandbox), hint: k.key_hint || null, allowIps: k.allow_ips || '', dayCap: k.day_cap ?? null, monthCap: k.month_cap_cents == null ? null : k.month_cap_cents / 100, calls: k.calls, createdAt: k.created_at, lastUsedAt: k.last_used_at, revoked: Boolean(k.revoked_at), revokedAt: k.revoked_at || null });
  // Who may rename, lock, limit or revoke a key: whoever made it, or a team key's owner and admins.
  const canManage = (k, userId) => (k.team_id ? Boolean(teams?.canManage(k.team_id, userId)) : k.user_id === userId);
  // Yours and your teams' keys. Revoked keys stay listed (greyed), so old calls still name their key.
  const keysOf = (userId) => db.prepare(`SELECT k.*, t.name AS team_name FROM engine_keys k LEFT JOIN teams t ON t.id = k.team_id
      WHERE k.user_id = ? OR k.team_id IN (SELECT team_id FROM team_members WHERE user_id = ?) ORDER BY k.revoked_at IS NOT NULL, k.team_id IS NOT NULL, k.id`).all(userId, userId)
    .map((k) => ({ ...keyOut(k), team: k.team_id ? { id: k.team_id, name: k.team_name || 'Closed team' } : null, canManage: canManage(k, userId) }));
  function makeKey(user, name, test = false, teamId = null) {
    // A team key belongs to the team and runs on its owner's plan.
    let owner = user.id;
    if (teamId) {
      const t = teams?.team(Number(teamId));
      if (!t || !teams.roleIn(t.id, user.id)) throw new HttpError(404, 'No team with that id.');
      if (!teams.canManage(t.id, user.id)) throw new HttpError(403, 'Only the team’s owner and admins make its keys.');
      owner = t.owner_id;
    }
    // Test keys don't use up the plan's key count (two at a time).
    const maxKeys = test ? 2 : plans ? plans.planFor(owner).keys : API_LIMITS.keys;
    if (db.prepare('SELECT COUNT(*) AS n FROM engine_keys WHERE user_id = ? AND revoked_at IS NULL AND sandbox = ?').get(owner, test ? 1 : 0).n >= maxKeys) throw new HttpError(400, test ? 'You can have 2 test keys. Revoke one to make another.' : teamId && owner !== user.id ? `The team owner's plan allows ${maxKeys} keys, team keys included. Revoke one to make another.` : `You can have ${maxKeys} keys on your plan. Revoke one to make another.`);
    const key = `vx_${test ? 'test_' : ''}${randomBytes(24).toString('base64url')}`;
    const info = db.prepare('INSERT INTO engine_keys (user_id, name, key_hash, key_hint, created_at, sandbox, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(owner, str(name, 60) || (test ? 'Test key' : 'My key'), hashToken(key), keyHint(key), Date.now(), test ? 1 : 0, teamId ? Number(teamId) : null);
    const made = keyOut(db.prepare('SELECT * FROM engine_keys WHERE id = ?').get(Number(info.lastInsertRowid)));
    onKey(owner, 'key.created', { key: { id: made.id, name: made.name, hint: made.hint } });
    return { key, ...made, team: teamId ? { id: Number(teamId), name: teams.team(Number(teamId)).name } : null };
  }
  // The key, if this person may change it; otherwise "no key" (never says whose it is).
  function manageable(id, userId) {
    const k = db.prepare('SELECT * FROM engine_keys WHERE id = ?').get(id);
    if (!k || !canManage(k, userId)) throw new HttpError(404, 'No key with that id.');
    return k;
  }
  // The member behind a key, or null. Sessions don't count: the API takes keys only.
  function keyUser(req) {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer vx_')) return null;
    const k = db.prepare('SELECT k.id AS key_id, k.allow_ips, k.sandbox, u.id, u.handle, u.role FROM engine_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ? AND k.revoked_at IS NULL AND u.role != \'banned\'').get(hashToken(auth.slice(7).trim()));
    return k || null;
  }
  function requireKey(req, ctx = {}) {
    const k = keyUser(req);
    if (!k) throw new HttpError(401, 'Send your key as “Authorization: Bearer vx_…”. Make one in your console.');
    if (!ipAllowed(ctx.ip, k.allow_ips)) throw new HttpError(403, `That key only works from its allowed addresses, and ${ctx.ip || 'this address'} isn’t one of them.`);
    // Test keys: work while the API is off, never count against the plan, 20 calls a minute.
    if (k.sandbox) { if (!testMinute.take(`t:${k.key_id}`)) throw new HttpError(429, 'Slow down: 20 calls a minute on a test key.'); return k; }
    if (off() && !isStaff(k)) throw new HttpError(503, 'The engine API isn’t switched on yet. Watch the roadmap.');
    // The account's plan sets the limits (and whether use past the day's allowance is billed).
    if (plans) { k.plan = plans.take(k.id, k.key_id); return k; }
    if (!minute.take(`m:${k.key_id}`)) throw new HttpError(429, `Slow down: ${API_LIMITS.perMinute} generations a minute per key.`);
    if (!day.take(`d:${k.key_id}`)) throw new HttpError(429, `That key has made ${API_LIMITS.perDay} models today. Tomorrow, then.`);
    return k;
  }

  // ---------- generating ----------
  // Settings as the generators take them, kept within the site's limits.
  function cleanParams(kind, raw) {
    if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) throw new HttpError(400, 'params must be an object of settings.');
    const p = { ...(raw || {}) };
    if (JSON.stringify(p).length > 32 * 1024) throw new HttpError(413, 'That is too many settings.');
    const lim = controls.controls.limits || {};
    const paused = controls.generatorBlock(kind, false);
    if (paused) throw new HttpError(423, paused);
    for (const k of ['gridX', 'gridY']) if (typeof p[k] === 'number' && lim.maxGrid && p[k] > lim.maxGrid) throw new HttpError(400, `${k} is at most ${lim.maxGrid}.`);
    if (typeof p.heightUnits === 'number' && lim.maxHeightUnits && p.heightUnits > lim.maxHeightUnits) throw new HttpError(400, `heightUnits is at most ${lim.maxHeightUnits}.`);
    return p;
  }
  function parts(kind, params) {
    if (!API_KINDS[kind]) throw new HttpError(400, `kind must be one of ${Object.keys(API_KINDS).join(', ')}.`);
    let out;
    try { out = buildParts(kind, cleanParams(kind, params)); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, `The ${kind} generator refused those settings: ${e.message}`); }
    if (!out?.length) throw new HttpError(400, 'Those settings make nothing.');
    return out;
  }
  const summary = (list) => list.map((p) => { const b = p.mesh.bounds(); return { name: p.name, triangles: p.mesh.triangleCount, size: b.size.map((v) => Math.round(v * 100) / 100) }; });

  const formatOf = (body) => {
    const format = str(body.format || '3mf', 5).toLowerCase();
    if (!API_FORMATS[format]) throw new HttpError(400, `format must be one of ${Object.keys(API_FORMATS).join(', ')}.`);
    if (controls.isOff(format === '3mf' ? 'multiColour' : format) && format !== '3mf') throw new HttpError(503, `${format.toUpperCase()} downloads are switched off right now.`);
    return format;
  };
  function generate(k, body, ctx) {
    const kind = str(body.kind, 20), format = formatOf(body);
    if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind, format, params: body.params || {} });
    return deliver(k, parts(kind, body.params), { kind, format, name: body.name, part: body.part, params: body.params || {} }, ctx);
  }
  // Parts → the file: a test cube for a test key; otherwise the model, with a serial number recorded like a site download.
  function deliver(k, list, { kind, format, name: wanted, part: wantedPart, params = {} }, ctx) {
    const body = { part: wantedPart, params };
    const name = str(wanted, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || kind;
    // A test key: the request was checked like a real one; the file is a 20 mm test cube, not the model.
    if (k.sandbox) {
      if (format === 'stl' && list.length > 1 && !list.some((p) => p.name === str(body.part, 60))) throw new HttpError(400, `This model has ${list.length} parts; STL takes one at a time. Pass "part" as one of: ${list.map((p) => p.name).join(', ')}. Or ask for 3mf to get them all.`);
      const cube = testCube(), bytes = format === 'stl' ? toSTL(cube, `${name}-test`) : format === 'obj' ? toOBJ([{ mesh: cube, name: `${name}-test` }], `${name}-test`) : to3MF([{ mesh: cube, name: `${name}-test` }], `${name}-test`);
      return { bytes: Buffer.from(bytes.buffer ? bytes : new Uint8Array(bytes)), name: `${name}-test.${format}`, type: API_FORMATS[format], serial: 'TEST', parts: list.map((p) => p.name), test: true };
    }
    let chosen = list;
    if (format === 'stl' && list.length > 1) {
      const part = str(body.part, 60);
      chosen = list.filter((p) => p.name === part);
      if (!chosen.length) throw new HttpError(400, `This model has ${list.length} parts; STL takes one at a time. Pass "part" as one of: ${list.map((p) => p.name).join(', ')}. Or ask for 3mf to get them all.`);
    }
    // Every file carries a serial number, kept with who made it and how, like a download from the site.
    const serial = newSerial();
    setSerial(serial);
    let bytes;
    try {
      bytes = format === 'stl' ? toSTL(chosen[0].mesh, name) : format === 'obj' ? toOBJ(chosen, name) : to3MF(chosen, name);
    } finally { setSerial(''); }
    db.prepare('INSERT INTO download_serials (serial, user_id, device, ip, kind, format, design, engine, params, created_at) VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)')
      .run(serial, k.id, ctx.ip || null, kind, format, ENGINE.version, JSON.stringify(body.params || {}).slice(0, 16000), Date.now());
    db.prepare('UPDATE engine_keys SET calls = calls + 1, last_used_at = ? WHERE id = ?').run(Date.now(), k.key_id);
    analytics?.record('download', { user: { id: k.id }, ip: ctx.ip, device: null, ua: '' }, { kind, format, params: body.params || {}, extra: { source: 'api', serial } });
    return { bytes: Buffer.from(bytes.buffer ? bytes : new Uint8Array(bytes)), name: `${name}.${format}`, type: API_FORMATS[format], serial, parts: chosen.map((p) => p.name) };
  }

  const info = () => ({
    engine: ENGINE.version, version: 1, enabled: !off(), docs: '/docs',
    kinds: Object.keys(API_KINDS), formats: Object.keys(API_FORMATS), limits: { perMinute: API_LIMITS.perMinute, perDay: API_LIMITS.perDay, keys: API_LIMITS.keys },
  });
  const kinds = () => Object.fromEntries(Object.entries(API_KINDS).map(([k, v]) => [k, { name: v.name, generator: v.generator, defaults: v.defaults }]));

  // ---------- routes ----------
  async function handle(req, res, path, m, ctx, json, requireUser) {
    if (path === '/api/engine/v1' && m === 'GET') return json(res, 200, info(), { 'Cache-Control': 'public, max-age=60' }), true;
    if (path === '/api/engine/v1/kinds' && m === 'GET') return json(res, 200, { kinds: kinds() }, { 'Cache-Control': 'public, max-age=300' }), true;
    // Keys: yours, made and revoked while signed in on the site.
    if (path === '/api/engine/v1/keys' && m === 'GET') { const me = requireUser(ctx, 'Sign in to see your keys.'); return json(res, 200, { keys: keysOf(me.id), enabled: !off(), staff: isStaff(me) }), true; }
    if (path === '/api/engine/v1/keys' && m === 'POST') { const me = requireUser(ctx, 'Sign in to make a key.'); const body = await readJson(req, 4 * 1024); return json(res, 201, makeKey(me, body.name, Boolean(body.test), body.team || null)), true; }
    const km = path.match(/^\/api\/engine\/v1\/keys\/(\d+)$/);
    if (km && m === 'PATCH') {
      const me = requireUser(ctx, 'Sign in first.');
      const body = await readJson(req, 4 * 1024);
      const name = str(body.name, 60);
      const allow = 'allowIps' in body ? parseAllow(body.allowIps) : undefined;
      // Its own limits: calls a day, and dollars of extra use a month (null or empty: none).
      const lim = (v, max, scale) => (v === null || v === '' ? null : Math.round(Math.min(max, Math.max(0, Number(v) || 0)) * scale) || null);
      manageable(Number(km[1]), me.id);
      if ('dayCap' in body || 'monthCap' in body) {
        if ('dayCap' in body) db.prepare('UPDATE engine_keys SET day_cap = ? WHERE id = ?').run(lim(body.dayCap, 1e7, 1), Number(km[1]));
        if ('monthCap' in body) db.prepare('UPDATE engine_keys SET month_cap_cents = ? WHERE id = ?').run(lim(body.monthCap, 1e6, 100), Number(km[1]));
        if (!name && allow === undefined) return json(res, 200, keyOut(db.prepare('SELECT * FROM engine_keys WHERE id = ?').get(Number(km[1])))), true;
      }
      if (!name && allow === undefined) throw new HttpError(400, 'Give the key a name.');
      db.prepare('UPDATE engine_keys SET name = COALESCE(?, name), allow_ips = CASE WHEN ? THEN ? ELSE allow_ips END WHERE id = ?').run(name || null, allow === undefined ? 0 : 1, allow ?? null, Number(km[1]));
      return json(res, 200, keyOut(db.prepare('SELECT * FROM engine_keys WHERE id = ?').get(Number(km[1])))), true;
    }
    if (km && m === 'DELETE') {
      const me = requireUser(ctx, 'Sign in first.');
      const k = manageable(Number(km[1]), me.id);
      const r = db.prepare('UPDATE engine_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), k.id);
      if (!r.changes) throw new HttpError(404, 'No key with that id.');
      onKey(k.user_id, 'key.revoked', { key: { id: k.id, name: k.name, hint: k.key_hint }, by: k.user_id === me.id ? 'you' : `@${me.handle}` });
      return json(res, 200, { ok: true }), true;
    }
    // With a key: a dry run that lists the parts, or the file itself.
    if (path === '/api/engine/v1/parts' && m === 'POST') {
      const k = requireKey(req, ctx);
      const body = await readJson(req, 64 * 1024);
      if (ctx.apiMeta) Object.assign(ctx.apiMeta, { kind: str(body.kind, 20), params: body.params || {} });
      return json(res, 200, { kind: str(body.kind, 20), engine: ENGINE.version, parts: summary(parts(str(body.kind, 20), body.params)) }), true;
    }
    if (path === '/api/engine/v1/generate' && m === 'POST') {
      const k = requireKey(req, ctx);
      const body = await readJson(req, 64 * 1024);
      const file = generate(k, body, ctx);
      res.writeHead(200, {
        'Content-Type': file.type, 'Content-Length': file.bytes.length, 'Content-Disposition': `attachment; filename="${file.name}"`,
        'X-Vertex-Serial': file.serial, 'X-Vertex-Engine': ENGINE.version, 'X-Vertex-Parts': file.parts.join(','), 'Cache-Control': 'no-store', ...(file.test ? { 'X-Mint-Test': '1' } : {}),
        ...(k.plan ? { 'X-Mint-Plan': k.plan.plan.id, ...(k.plan.over ? { 'X-Mint-Extra-Use': '1' } : {}) } : {}),
      });
      res.end(file.bytes);
      return true;
    }
    return false;
  }

  return { handle, info, kinds, generate, deliver, formatOf, parts, requireKey, keyUser, makeKey, keysOf };
}
