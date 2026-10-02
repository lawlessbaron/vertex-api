// Family charging stations: a slot for each phone or tablet over a hidden
// power strip or USB charger, each slot with its owner's name in front. Two
// parts. The tray hides the charger: walls round it, a notch at the back for
// its power cord, vents down the sides, and a ledge inside near the top. The
// rack drops onto the ledge: a plate with upright dividers, and in each slot
// an opening the plug and cable drop through to the charger below, so a
// device stands on its edge to charge. Both print upright, no supports: walls
// and dividers go straight up, and the cord notch and vents are short bridges.
import { Mesh } from './mesh.js';
import { textPolygons, textUnits } from './font.js';
import { rr, sections } from './slabs.js';

export const FAMILYCHARGER_DEFAULTS = {
  devices: 4,
  slotW: 16, // each slot across: the thickest device in its case, plus a little
  slotL: 90, // how deep the dividers reach (the devices' width)
  dividerH: 70, // the dividers above the plate
  names: 'MUM,DAD,ALEX,SAM', // comma-separated, one per slot, left to right
  hubW: 180, // the power strip or USB charger inside: across
  hubD: 60, // front to back
  hubH: 40, // its height, plug tops and all
  cable: 8, // the openings each plug drops through
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const WALL = 2.4, FLOOR = 2.4, LEDGE = 3, PLATE = 3, DIV = 3, LABEL = 14, BACK = 6, PLAY = 0.3, RAISE = 0.8;

export function familyChargerPlan(options = {}) {
  const o = { ...FAMILYCHARGER_DEFAULTS, ...options };
  const n = Math.round(num(o.devices, 2, 8, 4)), sw = num(o.slotW, 8, 30, 16), sl = num(o.slotL, 50, 160, 90), dh = num(o.dividerH, 30, 140, 70);
  const hubW = num(o.hubW, 40, 240, 180), hubD = num(o.hubD, 30, 120, 60), hubH = num(o.hubH, 20, 80, 40), cable = num(o.cable, 5, 14, 8);
  const names = String(o.names || '').split(',').map((s) => s.trim().toUpperCase().slice(0, 10));
  // The rack's plate: its slots side by side, the name strip in front, a margin behind.
  const slotsW = n * (sw + 2 * DIV + 4); // each slot its own bay: two dividers and a little room either side
  const Wi = Math.max(slotsW, hubW + 2 * LEDGE + 2), Di = Math.max(LABEL + sl + BACK, hubD + 2 * LEDGE + 2);
  const Wo = Wi + 2 * WALL, Do = Di + 2 * WALL, H = FLOOR + hubH + 2 + PLATE; // the tray's height: the plate's top is flush with the rim
  return { n, sw, sl, dh, hubW, hubD, hubH, cable, names, slotsW, Wi, Di, Wo, Do, H };
}

export function generateFamilyCharger(options = {}) {
  const p = familyChargerPlan(options), { n, sw, sl, dh, hubH, cable, names, slotsW, Wi, Di, Wo, Do, H } = p;
  if (Wo > 250 || Do > 250) throw new Error(`That station is ${Math.ceil(Wo)} × ${Math.ceil(Do)} mm: bigger than a 250 mm bed. Fewer or narrower slots, or a smaller charger.`);
  if (H + dh > 250) throw new Error('That station is taller than a 250 mm bed: shorter dividers or a lower charger.');

  // The tray, centred on the origin, front at −y.
  const ledgeZ = H - PLATE, cord = 14, cordW = 18;
  const vents = Math.max(1, Math.floor((Di - 30) / 12));
  const ventZ0 = FLOOR + 6, ventZ1 = Math.max(ventZ0 + 6, ledgeZ - 8);
  const tray = sections([-Wo / 2 - 1, -Do / 2 - 1, Wo / 2 + 1, Do / 2 + 1], [0, 0.4, FLOOR, cord, ventZ0, ventZ1, ledgeZ, H], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0; // the bed face steps in
    d.on(rr(-Wo / 2 + f, -Do / 2 + f, Wo / 2 - f, Do / 2 - f, 6));
    if (z > FLOOR) {
      const inset = z < ledgeZ ? LEDGE : 0; // the ledge the rack rests on
      d.off(rr(-Wi / 2 + inset, -Di / 2 + inset, Wi / 2 - inset, Di / 2 - inset, Math.max(0.5, 3.6 - inset)));
    }
    if (z < cord) d.off(rr(-cordW / 2, Do / 2 - WALL - LEDGE - 1, cordW / 2, Do / 2 + 1)); // the power cord out the back
    if (z > ventZ0 && z < ventZ1) for (let i = 0; i < vents; i++) {
      const y = -((vents - 1) * 12) / 2 + i * 12;
      for (const s of [-1, 1]) d.off(rr(s > 0 ? Wi / 2 - LEDGE - 1 : -Wo / 2 - 1, y - 2, s > 0 ? Wo / 2 + 1 : -Wi / 2 + LEDGE + 1, y + 2)); // through wall and ledge
    }
  }, 0.15, 0.08);

  // The rack: the plate, the dividers, an opening in each slot and the names in front.
  const Wp = Wi - 2 * PLAY, Dp = Di - 2 * PLAY, y0 = -Dp / 2, ys = y0 + LABEL, ye = ys + sl;
  const bay = Wp / n, bayX = (i) => -Wp / 2 + i * bay; // the rack is shared out evenly: a bay per slot
  const slotX = (i) => bayX(i) + (bay - sw) / 2; // a slot's left side, centred in its bay
  const open = Math.min(cable, sw - 4), openL = Math.min(32, sl - 16);
  const label = (i) => {
    const t = names[i];
    if (!t) return [];
    const units = textUnits(t), h = Math.min(7, ((bay - 4) / units) * 6, LABEL - 5);
    if (h < 3) return null; // too long to read across the slot: say so in the notes
    const w = (units * h) / 6, cx = slotX(i) + sw / 2;
    return textPolygons(t, cx - w / 2, y0 + (LABEL - h) / 2, h, Math.max(0.7, h * 0.16));
  };
  const labels = Array.from({ length: n }, (_, i) => label(i));
  const rack = sections([-Wp / 2 - 1, -Dp / 2 - 1, Wp / 2 + 1, Dp / 2 + 1], [0, 0.4, PLATE, PLATE + RAISE, PLATE + dh], (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    if (z < PLATE) {
      d.on(rr(-Wp / 2 + f, -Dp / 2 + f, Wp / 2 - f, Dp / 2 - f, 3));
      for (let i = 0; i < n; i++) { const cx = slotX(i) + sw / 2, cy = (ys + ye) / 2; d.off(rr(cx - open / 2, cy - openL / 2, cx + open / 2, cy + openL / 2, open / 2 - 0.01)); }
      return;
    }
    for (let i = 0; i < n; i++) for (const x of [slotX(i) - DIV, slotX(i) + sw]) d.on(rr(x, ys, x + DIV, ye, 1)); // a pair of dividers per slot
    if (z < PLATE + RAISE) for (const l of labels) for (const q of l || []) d.on(q); // the names, raised
  }, 0.12, 0.06);

  // On the tray: the rack's bottom on the ledge.
  const preview = new Mesh(); preview.append(tray);
  const r = new Mesh(); r.append(rack);
  for (let i = 2; i < r.positions.length; i += 3) r.positions[i] += ledgeZ;
  preview.append(r);
  const tooLong = labels.map((l, i) => (l === null ? names[i] : null)).filter(Boolean);
  const notes = [
    `${n} slots ${sw} mm wide over a charger up to ${p.hubW} × ${p.hubD} × ${hubH} mm. The station is ${Math.round(Wo)} × ${Math.round(Do)} mm and ${Math.round(H + dh)} mm tall.`,
    'Put the charger in the tray with its cord out of the notch at the back, plug a cable in for each slot and push each one up through its slot, then drop the rack in. A short right-angle plug lets a device stand straight.',
    'Print both upright (as they come), no supports.',
  ];
  if (tooLong.length) notes.push(`Too long to fit in front of a slot: ${tooLong.join(', ')}. Use a shorter name or wider slots.`);
  return { parts: [{ mesh: tray, name: 'charger-tray' }, { mesh: rack, name: 'device-rack' }], notes, preview };
}
