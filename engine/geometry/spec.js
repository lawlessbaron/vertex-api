// Gridfinity dimensions (mm), following Zack Freedman's spec.
// Profiles are lists of [z, inset] measured from the outline they belong to.
export const SPEC = {
  pitch: 42,
  heightUnit: 7,
  clearance: 0.5, // bin outline is pitch - clearance

  binRadius: 3.75,
  baseHeight: 4.75,
  // Bin foot, bottom to top.
  footProfile: [
    [0, 2.95],
    [0.8, 2.15],
    [2.6, 2.15],
    [4.75, 0],
  ],

  // Stacking lip inner face, relative to the wall top (H), bottom to top.
  // Mirrors the baseplate pocket so a bin stacks like it sits on a plate.
  lipProfile: [
    [0, 2.6],
    [0.7, 1.9],
    [2.5, 1.9],
    [4.4, 0.3], // true spec is a knife edge; keep a small flat so it prints
  ],
  lipHeight: 4.4,

  // Magnets and screws (per the spec and gridfinity-rebuilt).
  magnetDiameter: 6.5, // hole for a 6 x 2 mm magnet
  magnetDepth: 2.4,
  crushRibDiameter: 5.9,
  screwDiameter: 3, // M3
  screwDepth: 6,
  holeFromEdge: 8, // hole centre from the edge of a 42 mm cell

  labelWidth: 42, // widest non-full label tab

  // Weighted baseplate pockets.
  weightPocket: 21.4,
  weightDepth: 4,

  plateRadius: 4,
  plateHeight: 4.65,
  // Baseplate pocket, bottom to top, inset from the cell edge.
  plateProfile: [
    [0, 2.85],
    [0.7, 2.15],
    [2.5, 2.15],
    [4.65, 0.25], // small flat between neighbouring pockets
  ],
};
