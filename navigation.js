// Small, deterministic A* grid. Clearance includes the enemy's collision radius.
export function createNavigation(pieces, half = 30, cell = 1.5, radius = 0.46) {
  const size = Math.floor(half * 2 / cell);
  const blocked = new Uint8Array(size * size);
  const point = id => ({ x: -half + (id % size + 0.5) * cell, z: -half + (Math.floor(id / size) + 0.5) * cell });
  const obstacles = pieces.filter(p => (p.y || 0) < 1.75).map(p => ({
    minX: p.x - p.w / 2 - radius, maxX: p.x + p.w / 2 + radius,
    minZ: p.z - p.d / 2 - radius, maxZ: p.z + p.d / 2 + radius,
  }));
  for (let id = 0; id < blocked.length; id++) {
    const { x, z } = point(id);
    blocked[id] = obstacles.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) ? 1 : 0;
  }
  function crossesObstacle(from, to, box) {
    let enter = 0, exit = 1;
    for (const [axis, minKey, maxKey] of [['x', 'minX', 'maxX'], ['z', 'minZ', 'maxZ']]) {
      const min = box[minKey] + 1e-8, max = box[maxKey] - 1e-8;
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-10) {
        if (from[axis] < min || from[axis] > max) return false;
      } else {
        const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) return false;
      }
    }
    return enter <= exit;
  }
  // Occupancy alone misses thin walls between grid centres. Bake safe edges
  // once, including diagonal flank clearance, instead of testing geometry on
  // every enemy's path request. Nine bits fit inside a Uint16 (centre unused).
  const edges = new Uint16Array(blocked.length);
  for (let id = 0; id < blocked.length; id++) {
    if (blocked[id]) continue;
    const x = id % size, z = Math.floor(id / size), from = point(id);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= size || z + dz < 0 || z + dz >= size) continue;
      const next = (z + dz) * size + x + dx;
      if (blocked[next]) continue;
      if (dx && dz && (blocked[z * size + x + dx] || blocked[(z + dz) * size + x])) continue;
      const to = point(next);
      if (obstacles.some(box => crossesObstacle(from, to, box))) continue;
      edges[id] |= 1 << ((dx + 1) * 3 + dz + 1);
    }
  }
  function nearest(pos) {
    let closest = -1, distance = Infinity;
    for (let id = 0; id < blocked.length; id++) {
      if (blocked[id]) continue;
      const p = point(id), d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
      if (d < distance) { closest = id; distance = d; }
    }
    return closest;
  }
  function findPath(from, to) {
    const start = nearest(from), goal = nearest(to);
    if (start < 0 || goal < 0) return [];
    const open = [start], closed = new Set(), parents = new Int32Array(blocked.length).fill(-1);
    const costs = new Float32Array(blocked.length).fill(Infinity);
    costs[start] = 0;
    const gp = point(goal);
    const estimate = id => { const p = point(id); return Math.hypot(p.x - gp.x, p.z - gp.z) / cell; };
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (costs[open[i]] + estimate(open[i]) < costs[open[best]] + estimate(open[best])) best = i;
      const current = open.splice(best, 1)[0];
      if (current === goal) {
        const route = [];
        for (let id = goal; id !== start; id = parents[id]) route.push(point(id));
        return route.reverse();
      }
      closed.add(current);
      const x = current % size, z = Math.floor(current / size);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!(edges[current] & (1 << ((dx + 1) * 3 + dz + 1)))) continue;
        const next = (z + dz) * size + x + dx;
        if (closed.has(next)) continue;
        const cost = costs[current] + Math.hypot(dx, dz);
        if (cost >= costs[next]) continue;
        costs[next] = cost; parents[next] = current;
        if (!open.includes(next)) open.push(next);
      }
    }
    return [];
  }
  return { findPath, blocked, point, size };
}
