// What a shared model can say about itself: its category, licence, origin and
// the files that can come with it. Shared by the upload flow, the model page
// and the server (server/listings.js), so they always agree.

export const CATEGORIES = {
  'gridfinity-bins': 'Gridfinity bins',
  'gridfinity-baseplates': 'Gridfinity baseplates',
  'tool-holders': 'Tool holders and inserts',
  skadis: 'Skådis and pegboard',
  motivemesh: 'Tectonic Deck',
  desk: 'Desk and office',
  electronics: 'Electronics and cables',
  workshop: 'Workshop and garage',
  home: 'Kitchen and home',
  hobby: 'Hobbies and games',
  'printer-parts': '3D printer parts and upgrades',
  other: 'Something else',
};

export const ORIGINS = {
  original: { name: 'Original', help: 'You designed it yourself.' },
  remix: { name: 'Remix', help: 'You changed or built on someone else’s model.' },
  shared: { name: 'Shared', help: 'Someone else designed it and you have their permission to share it here.' },
};

// Creative Commons licences, from the most open to the most closed.
export const LICENCES = {
  cc0: { name: 'Public domain (CC0 1.0)', short: 'CC0', summary: 'You give up all rights: anyone can use it for anything, no credit needed.', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'cc-by': { name: 'Attribution (CC BY 4.0)', short: 'CC BY', summary: 'Anyone can use and change it for any purpose, including commercially, as long as they credit you.', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'cc-by-sa': { name: 'Attribution-ShareAlike (CC BY-SA 4.0)', short: 'CC BY-SA', summary: 'Anyone can use and change it for any purpose, including commercially, if they credit you and share their changes under the same licence.', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'cc-by-nd': { name: 'Attribution-NoDerivatives (CC BY-ND 4.0)', short: 'CC BY-ND', summary: 'Anyone can print and share it as it is, with credit. No changed versions.', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  'cc-by-nc': { name: 'Attribution-NonCommercial (CC BY-NC 4.0)', short: 'CC BY-NC', summary: 'Anyone can use and change it with credit, but not to make money.', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  'cc-by-nc-sa': { name: 'Attribution-NonCommercial-ShareAlike (CC BY-NC-SA 4.0)', short: 'CC BY-NC-SA', summary: 'Anyone can use and change it with credit, not commercially, sharing changes the same way.', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  'cc-by-nc-nd': { name: 'Attribution-NonCommercial-NoDerivatives (CC BY-NC-ND 4.0)', short: 'CC BY-NC-ND', summary: 'Anyone can print and share it as it is, with credit, not commercially. No changed versions.', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  'vertex-exclusive': { name: 'VERTEX Exclusive Licence', short: 'VERTEX Exclusive', summary: 'Free to print with credit. Remixes may be published only on VERTEX. Not for sale, and not to be posted on any other site.', url: '/licences#exclusive', exclusive: true },
};
// The upload page's dropdown: non-commercial first (what we suggest), then the
// rest, each in a few plain words.
export const LICENCE_GROUPS = [
  ['Not for sale (suggested)', ['cc-by-nc-sa', 'cc-by-nc', 'cc-by-nc-nd']],
  ['Only on VERTEX', ['vertex-exclusive']],
  ['Commercial use allowed', ['cc-by-sa', 'cc-by', 'cc-by-nd']],
  ['No rights kept', ['cc0']],
];
export const LICENCE_PLAIN = {
  'cc-by-nc-sa': 'credit me, not for sale, remixes keep this licence',
  'cc-by-nc': 'credit me, not for sale',
  'cc-by-nc-nd': 'credit me, not for sale, no changed versions',
  'cc-by-sa': 'credit me, remixes keep this licence',
  'cc-by': 'credit me',
  'cc-by-nd': 'credit me, no changed versions',
  cc0: 'public domain, no conditions',
  'vertex-exclusive': 'credit me, not for sale, remixes only on VERTEX, not posted anywhere else',
};
// Remixes allowed? (no-derivatives licences say no.)
export const allowsRemix = (licence) => !String(licence).endsWith('-nd');

// Three plain questions → a licence.
//   credit: must people credit you? (no means public domain)
//   adapt: 'yes' | 'alike' (share changes the same way) | 'no'
//   commercial: may people sell prints or use it commercially?
export function licenceFrom({ credit = true, adapt = 'yes', commercial = true } = {}) {
  if (!credit) return 'cc0';
  return `cc-by${commercial ? '' : '-nc'}${adapt === 'alike' ? '-sa' : adapt === 'no' ? '-nd' : ''}`;
}
export function answersFor(licence) {
  if (licence === 'vertex-exclusive') return { credit: true, adapt: 'alike', commercial: false };
  if (licence === 'cc0') return { credit: false, adapt: 'yes', commercial: true };
  return { credit: true, commercial: !licence.includes('-nc'), adapt: licence.endsWith('-sa') ? 'alike' : licence.endsWith('-nd') ? 'no' : 'yes' };
}

// Files that can come with a model: printable models, CAD sources and documents.
export const FILE_KINDS = {
  stl: { label: 'STL', role: 'model' },
  '3mf': { label: '3MF', role: 'model' },
  obj: { label: 'OBJ', role: 'model' },
  step: { label: 'STEP', role: 'source' },
  scad: { label: 'OpenSCAD', role: 'source' },
  f3d: { label: 'Fusion', role: 'source' },
  pdf: { label: 'PDF', role: 'doc' },
};
export const FILE_ACCEPT = '.stl,.3mf,.obj,.step,.stp,.scad,.f3d,.pdf';

export const SUPPORTS = { none: 'No supports', plate: 'Supports on the build plate', everywhere: 'Supports everywhere', tree: 'Tree supports', painted: 'Painted supports (in the 3MF)' };
export const NOZZLES = ['0.2', '0.4', '0.6', '0.8'];

// Rewards for a well-made listing (points, shown while uploading).
export const LISTING_POINTS = { share: 10, printReady: 15 };

// Ways someone can be credited on a model, besides being its maker.
export const CREDIT_ROLES = { codesigner: 'Co-designer', tester: 'Test printer', photos: 'Photos', idea: 'The idea', parts: 'Parts and hardware', docs: 'Instructions' };
