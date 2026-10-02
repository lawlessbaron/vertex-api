// Board game insert trays: a tray for a game's box with wells for its card
// decks along the back (sized to the cards in their sleeves, each with a
// finger notch to lift the deck) and a grid of token compartments in front,
// their floors curving up so tokens scoop out. Print one or several to fill
// the box. Drawn in plan as slabs and printed upright: the walls go straight
// up, the notches and curves are cut away as they rise: nothing overhangs.
import { rr, sections } from './slabs.js';

export const GAMEINSERT_DEFAULTS = {
  width: 220, // the tray, across
  depth: 200, // front to back
  height: 40,
  decks: 2, // card wells along the back
  cardW: 66, // a card in its sleeve, across
  cardH: 91, // and long
  tokens: 4, // token compartments across the front
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const FLOOR = 1.6, WALL = 2, DIV = 1.6, PLAY = 1, NOTCH = 22, SCOOP = 8;

export function generateGameInsert(options = {}) {
  const o = { ...GAMEINSERT_DEFAULTS, ...options };
  const W = num(o.width, 80, 240, 220), D = num(o.depth, 80, 240, 200), H = num(o.height, 15, 80, 40);
  const decks = Math.round(num(o.decks, 0, 4, 2)), cw = num(o.cardW, 40, 100, 66) + PLAY, ch = num(o.cardH, 50, 130, 91) + PLAY, tokens = Math.round(num(o.tokens, 0, 6, 4));
  const deckRow = decks ? ch + DIV : 0;
  if (decks * cw + (decks + 1) * DIV + 2 * WALL - 2 * DIV > W + 0.01) throw new Error(`${decks} decks ${Math.round(cw)} mm wide don't fit across ${W} mm: fewer decks or a wider tray.`);
  if (deckRow + 2 * WALL > D) throw new Error(`Cards ${Math.round(ch)} mm long don't fit in a tray ${D} mm deep.`);
  // Card wells along the back, left to right; tokens share the front.
  const wells = [];
  const yTop = D / 2 - WALL, yCards = yTop - ch;
  for (let i = 0; i < decks; i++) { const x0 = -W / 2 + WALL + i * (cw + DIV); wells.push([x0, yCards, x0 + cw, yTop]); }
  // What's left of the back row beside the decks becomes one more compartment.
  const deckEnd = -W / 2 + WALL + decks * (cw + DIV) - DIV;
  const cells = [];
  if (decks && W / 2 - WALL - (deckEnd + DIV) > 20) cells.push([deckEnd + DIV, yCards, W / 2 - WALL, yTop]);
  const fy0 = -D / 2 + WALL, fy1 = decks ? yCards - DIV : yTop;
  if (tokens && fy1 - fy0 > 15) {
    const tw = (W - 2 * WALL - (tokens - 1) * DIV) / tokens;
    for (let i = 0; i < tokens; i++) { const x0 = -W / 2 + WALL + i * (tw + DIV); cells.push([x0, fy0, x0 + tw, fy1]); }
  }
  const cuts = [0, 0.4, FLOOR, H, H - NOTCH * 0.6];
  for (let i = 0; i <= 6; i++) cuts.push(FLOOR + (SCOOP * i) / 6);
  for (let z = H - NOTCH * 0.6; z <= H; z += 1) cuts.push(z);
  const mesh = sections([-W / 2 - 1, -D / 2 - 1, W / 2 + 1, D / 2 + 1], cuts, (z, d) => {
    const f = z < 0.4 ? 0.4 : 0;
    d.on(rr(-W / 2 + f, -D / 2 + f, W / 2 - f, D / 2 - f, 4));
    if (z < FLOOR) return;
    for (const [l, b, r, t] of wells) d.off(rr(l, b, r, t, 1.5)); // square-floored wells: cards lie flat
    const h = Math.min(SCOOP, z - FLOOR), k = SCOOP - Math.sqrt(Math.max(0, SCOOP * SCOOP - (SCOOP - h) * (SCOOP - h)));
    for (const [l, b, r, t] of cells) { const kk = Math.min(k, (r - l) / 2 - 1, (t - b) / 2 - 1); d.off(rr(l + kk, b + kk, r - kk, t - kk, Math.max(1, Math.min(SCOOP, (r - l) / 2 - kk - 0.5)))); }
    // A finger notch in the wall in front of each deck, rounded at the bottom and widening as it rises.
    const nz = z - (H - NOTCH * 0.6);
    if (nz > 0) for (const [l, b, r] of wells) {
      const half = (NOTCH / 2) * Math.sqrt(Math.min(1, nz / (NOTCH * 0.6)) * (2 - Math.min(1, nz / (NOTCH * 0.6)))), cx = (l + r) / 2;
      d.off(rr(cx - half, b - DIV - 1, cx + half, b + 1));
    }
  }, 0.25, 0.15);
  const notes = [
    `${decks ? `${decks} card well${decks > 1 ? 's' : ''} for cards up to ${Math.round(cw - PLAY)} × ${Math.round(ch - PLAY)} mm` : 'No card wells'}${cells.length ? ` and ${cells.length} compartment${cells.length > 1 ? 's' : ''} for tokens` : ''}, in a tray ${W} × ${D} × ${H} mm.`,
    'Measure inside the game box and print a tray (or a few) to fill it; leave a millimetre or two all round. A tray as tall as the box lets the lid close on it.',
    'Print upright (as it comes), no supports.',
  ];
  return { parts: [{ mesh, name: 'game-insert' }], notes, preview: mesh };
}
