// Indexed triangle mesh. A mesh may hold several closed shells; each shell is
// watertight on its own and slicers union overlapping/touching shells.
export class Mesh {
  constructor() {
    this.positions = [];
    this.indices = [];
  }

  addVertex(x, y, z) {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }

  addTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  addQuad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  append(other) {
    // A mesh back from the background worker holds typed arrays, which can't grow.
    if (!Array.isArray(this.positions)) { this.positions = Array.from(this.positions); this.indices = Array.from(this.indices); }
    const offset = this.positions.length / 3;
    for (const p of other.positions) this.positions.push(p);
    for (const i of other.indices) this.indices.push(i + offset);
    return this;
  }

  translate(dx, dy, dz) {
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += dx;
      p[i + 1] += dy;
      p[i + 2] += dz;
    }
    return this;
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
    return { min, max, size: max.map((v, k) => v - min[k]) };
  }

  // Sum of signed tetrahedron volumes (mm^3). Overlapping shells are counted
  // once each, so treat this as an upper bound for unioned solids.
  volume() {
    const p = this.positions;
    const ix = this.indices;
    let v = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      v +=
        p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    return v / 6;
  }
}
