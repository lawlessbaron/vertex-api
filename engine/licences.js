// Licences, the way people see them: the Creative Commons badges, what each
// licence lets you do in plain words, and the licence every generator's files
// carry.
//
// Everything the generators make is shared under Creative Commons
// Attribution-NonCommercial-ShareAlike 4.0 (CC BY-NC-SA 4.0): free to print,
// share and remix with credit, not for sale, and remixes keep the same licence.
// That includes Tectonic Deck. Parts built on someone else's system also credit
// that system and its designers (Gridfinity, openGrid, Underware…). Underware
// is the designers' own CC BY-NC-SA work and is never for sale under any terms.
import { LICENCES } from './listing-meta.js';

// The Creative Commons icons, drawn to match the official ones (circle and
// symbol). Creative Commons asks licensors to mark their work with them.
const ring = '<circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2.4"/>';
const txt = (t, size = 13, dy = 0) => `<text x="16" y="${20.5 + dy}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" fill="currentColor">${t}</text>`;
export const CC_ICONS = {
  cc: `${ring}${txt('cc', 13, -0.5)}`,
  by: `${ring}<circle cx="16" cy="9.2" r="2.6" fill="currentColor"/><path d="M12.2 13.2h7.6v6.6h-2.2v5.4h-3.2v-5.4h-2.2z" fill="currentColor"/>`,
  nc: `${ring}${txt('$', 15, 0.5)}<path d="M6.6 6.6l18.8 18.8" stroke="currentColor" stroke-width="2.4"/>`,
  sa: `${ring}<path d="M21.4 16a5.4 5.4 0 1 1-1.6-3.8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M17.4 10.6l5.2-.2-1 5.1z" fill="currentColor"/>`,
  nd: `${ring}<path d="M10 13h12M10 19h12" stroke="currentColor" stroke-width="2.8"/>`,
  zero: `${ring}${txt('0', 15, 0.5)}`,
};
const LABELS = { cc: 'Creative Commons', by: 'Credit the designer', nc: 'Not for sale or other commercial use', sa: 'Share remixes under the same licence', nd: 'No changed versions', zero: 'Public domain' };
const icon = (k) => `<svg class="cc-icon" viewBox="0 0 32 32" width="22" height="22" role="img" aria-label="${LABELS[k]}"><title>${LABELS[k]}</title>${CC_ICONS[k]}</svg>`;

const EXCLUSIVE = 'vertex-exclusive';
export const isExclusive = (key) => key === EXCLUSIVE;

/** The icons in a licence, in the Creative Commons order. */
export function licenceIcons(key) {
  if (key === 'cc0') return ['cc', 'zero'];
  if (isExclusive(key)) return ['by', 'nc'];
  const k = String(key || '');
  return ['cc', 'by', ...(k.includes('-nc') ? ['nc'] : []), ...(k.endsWith('-sa') ? ['sa'] : []), ...(k.endsWith('-nd') ? ['nd'] : [])];
}
const UNDER = { cc: '', by: 'BY', nc: 'NC', sa: 'SA', nd: 'ND', zero: '0' };
/**
 * The licence's badge, the way Creative Commons draws them: a dark plate with
 * the icons, each named underneath (BY, NC, SA…). The VERTEX Exclusive licence
 * gets its own plate. With a name, the short name follows the badge.
 */
export function ccBadge(key, { withName = true } = {}) {
  const L = LICENCES[key];
  if (!L) return '';
  const plate = isExclusive(key)
    ? `<span class="cc-plate cc-excl"><span class="cc-excl-mark">VERTEX<br>EXCLUSIVE LICENCE</span>${licenceIcons(key).map((k) => `<span class="cc-slot">${icon(k)}<i>${UNDER[k]}</i></span>`).join('')}</span>`
    : `<span class="cc-plate">${licenceIcons(key).map((k) => `<span class="cc-slot${k === 'cc' ? ' cc-main' : ''}">${icon(k)}${UNDER[k] ? `<i>${UNDER[k]}</i>` : ''}</span>`).join('')}</span>`;
  return `<a class="cc-badge" href="${isExclusive(key) ? '/licences#exclusive' : L.url}" title="${L.name}: what it means"${isExclusive(key) ? '' : ' target="_blank" rel="noopener"'}>${plate}${withName ? `<span class="cc-name">${L.short}${key === 'cc0' ? ' 1.0' : isExclusive(key) ? ' 1.0' : ' 4.0'}</span>` : ''}</a>`;
}

// Each line of the checklist links to what it means on /licences.
export const TERMS = {
  attribution: { name: 'Sharing without attribution', what: 'Whether people may share it without naming the designer. With “BY” (Attribution) they must credit the designer, link the original and say which licence it uses.' },
  remix: { name: 'Remix culture allowed', what: 'Whether people may change it and share their changed version (a remix, or “derivative”). “ND” (NoDerivatives) says no.' },
  sharealike: { name: 'Remixes keep the same licence', what: 'With “SA” (ShareAlike), anything made from it must be shared under the same licence, so it stays as open as the original.' },
  commercial: { name: 'Commercial use', what: 'Selling prints or files, or using it anywhere you get money or another financial benefit. “NC” (NonCommercial) says no.' },
  elsewhere: { name: 'Posting on other sites', what: 'VERTEX Exclusive only: the model and remixes of it may only be published on VERTEX, not uploaded to any other site, app or marketplace.' },
  freeculture: { name: 'Free Cultural Works', what: 'Creative Commons’ mark for licences that let anyone use, change and share a work for any purpose, including commercially. Only CC0, CC BY and CC BY-SA qualify.' },
  opendef: { name: 'Meets the Open Definition', what: 'The Open Knowledge Foundation’s test for “open”: free to use, change and share for any purpose. The same three licences pass.' },
};
/** The checklist for a licence: [{ term, ok }], in the order Printables and Creative Commons show them. */
export function licenceRules(key) {
  const k = String(key || ''), pd = k === 'cc0', ex = isExclusive(k), nc = ex || k.includes('-nc'), nd = k.endsWith('-nd');
  const free = ['cc0', 'cc-by', 'cc-by-sa'].includes(k);
  return [
    { term: 'attribution', ok: pd },
    { term: 'remix', ok: !nd, note: ex ? 'on VERTEX only' : '' },
    ...(k.endsWith('-sa') || ex ? [{ term: 'sharealike', ok: true, need: true }] : []),
    { term: 'commercial', ok: !nc },
    ...(ex ? [{ term: 'elsewhere', ok: false }] : []),
    { term: 'freeculture', ok: free },
    { term: 'opendef', ok: free },
  ];
}
export function rulesList(key) {
  return `<ul class="cc-rules">${licenceRules(key).map((r) => `<li class="${r.need ? 'need' : r.ok ? 'yes' : 'no'}"><span aria-hidden="true">${r.need ? '!' : r.ok ? '✓' : '✕'}</span><a href="/licences#t-${r.term}">${TERMS[r.term].name}</a>${r.note ? ` <small>(${r.note})</small>` : ''}<b class="sr-only">${r.need ? ': required' : r.ok ? ': yes' : ': no'}</b></li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- generators

export const OUTPUT_LICENCE = 'cc-by-nc-sa';
const MM = 'Mint Motive (VERTEX)';
// What each system's parts are built on, and whose idea it is.
export const SYSTEM_CREDITS = {
  gridfinity: { based: 'Built to fit Gridfinity, the open storage system by Zack Freedman (MIT licence).', url: 'https://gridfinity.xyz' },
  skadis: { based: 'Built to fit IKEA SKÅDIS pegboards. VERTEX isn’t affiliated with IKEA; SKÅDIS is IKEA’s trade mark.' },
  opengrid: { based: 'Built on openGrid by David D (CC BY 4.0), credited here and in every file.', url: 'https://www.opengrid.world' },
  honeycomb: { based: 'Built to fit the Honeycomb Storage Wall idea by RostaP.', url: 'https://www.printables.com/model/152592' },
  morph: { based: 'Tectonic Deck and Deck Foundry are Mint Motive’s own.' },
  underware: { based: 'Underware 2.0 is by Hands on Katie and BlackjackDuck (Andy Levesque).', url: 'https://www.handsonkatie.com/', designer: 'Hands on Katie and BlackjackDuck (Andy Levesque)', never: true },
};
const OWN = 'Designed by Mint Motive.';

/** The licence a system's generated files carry: { key, designer, based, url, never }. */
export function outputLicence(system) {
  const c = SYSTEM_CREDITS[system] || {};
  return { key: OUTPUT_LICENCE, designer: c.designer || MM, based: c.based || OWN, url: c.url || null, never: Boolean(c.never) };
}
const NOT_FOR_SALE = 'Free for personal, non-commercial use. Share and remix it with credit, under the same licence. Not for sale.';
/** The metadata export.js writes into STL headers and 3MF files. */
export function exportMeta(system) {
  const o = outputLicence(system), L = LICENCES[o.key];
  return {
    name: 'Made with VERTEX', designer: o.designer, licence: 'CC-BY-NC-SA-4.0', licenceName: L.name.replace(/\s*\(.*\)$/, ' 4.0 International'), url: L.url,
    credit: `${o.never ? 'Underware by Hands on Katie & BlackjackDuck' : 'VERTEX by Mint Motive'} · CC BY-NC-SA 4.0`,
    note: `${o.based} ${NOT_FOR_SALE}${o.never ? ' Underware is never for sale under any terms.' : ' Selling prints or files needs written permission from Mint Motive.'}`,
    own: !o.never, short: 'CC BY-NC-SA 4.0',
  };
}
// The system whose files are being made now (each studio sets it), so a download carries the right credit.
let active = 'own';
export const setExportSystem = (system) => { active = system || 'own'; };
export const activeExportMeta = () => exportMeta(active);

/** The licence panel shown in every generator. */
export function licenceCard(system, { title = 'The licence on your files' } = {}) {
  const o = outputLicence(system), L = LICENCES[o.key];
  return `<div class="cc-card">
    <div class="cc-card-head"><b>${title}</b>${ccBadge(o.key)}</div>
    ${rulesList(o.key)}
    <p class="cc-small">${o.based} ${o.never ? 'Underware is free on VERTEX, always, and never for sale.' : 'Want to sell prints? That needs written permission from Mint Motive first.'} The licence, the credit and a serial number are written into every file. <a href="${L.url}" target="_blank" rel="noopener">Read the licence</a> · <a href="/licences">Licences on VERTEX</a></p>
  </div>`;
}
