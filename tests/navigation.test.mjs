import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from '../navigation.js';

const wall = (x, z, w, d, extra = {}) => ({ x, z, w, d, h: 3.4, ...extra });
const idAt = (nav, position) => {
  for (let id = 0; id < nav.blocked.length; id++) {
    const point = nav.point(id);
    if (point.x === position.x && point.z === position.z) return id;
  }
  return -1;
};
const nearestFree = (nav, position) => {
  let nearest, distance = Infinity;
  for (let id = 0; id < nav.blocked.length; id++) {
    if (nav.blocked[id]) continue;
    const point = nav.point(id);
    const next = Math.hypot(point.x - position.x, point.z - position.z);
    if (next < distance) { nearest = point; distance = next; }
  }
  return nearest;
};

// Check the whole segment, not only its endpoints: a route may not pass through
// an expanded collision box between otherwise unoccupied grid centres.
function crossesObstacle(from, to, obstacle, radius) {
  let enter = 0, exit = 1;
  for (const [axis, extent] of [['x', 'w'], ['z', 'd']]) {
    const min = obstacle[axis] - obstacle[extent] / 2 - radius + 1e-8;
    const max = obstacle[axis] + obstacle[extent] / 2 + radius - 1e-8;
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

function assertWalkable(nav, from, path, obstacles = [], radius = 0, cell = 1) {
  let previous = from;
  for (const point of path) {
    const id = idAt(nav, point);
    assert.notEqual(id, -1, 'every waypoint must be a grid centre');
    assert.equal(nav.blocked[id], 0, 'waypoints must preserve enemy clearance');
    const dx = point.x - previous.x, dz = point.z - previous.z;
    assert.ok(Math.abs(dx) <= cell && Math.abs(dz) <= cell, 'steps must use neighbouring cells');
    assert.ok(dx || dz, 'a path must not contain stationary steps');
    if (dx && dz) {
      assert.equal(nav.blocked[idAt(nav, { x: point.x, z: previous.z })], 0, 'diagonal horizontal flank must be clear');
      assert.equal(nav.blocked[idAt(nav, { x: previous.x, z: point.z })], 0, 'diagonal vertical flank must be clear');
    }
    for (const obstacle of obstacles) {
      assert.equal(crossesObstacle(previous, point, obstacle, radius), false, 'segments must not cut through collision geometry');
    }
    previous = point;
  }
}

test('open ground takes the shortest diagonal route and excludes the start', () => {
  const nav = createNavigation([], 4, 1, 0.2);
  const from = { x: -3.5, z: -3.5 }, to = { x: 3.5, z: 3.5 };
  const path = nav.findPath(from, to);
  assert.equal(path.length, 7);
  assert.deepEqual(path.at(-1), to);
  assertWalkable(nav, from, path);
  assert.deepEqual(nav.findPath(from, from), []);
  assert.deepEqual(nav.findPath(from, to), path, 'equal queries must yield deterministic routes');
});

test('central cover is circumnavigated with radius clearance', () => {
  const obstacles = [wall(0, 0, 8, 1)];
  const radius = 0.3, nav = createNavigation(obstacles, 6, 1, radius);
  const from = { x: 0.5, z: -4.5 }, to = { x: 0.5, z: 4.5 };
  const path = nav.findPath(from, to);
  assert.ok(path.length > 9, 'cover must force a detour');
  assert.ok(path.some(point => Math.abs(point.x) > 4 + radius));
  assert.deepEqual(path.at(-1), to);
  assertWalkable(nav, from, path, obstacles, radius);
});

test('a diagonal cannot slip between two touching corners', () => {
  const obstacles = [wall(0.5, -0.5, 0.9, 0.9), wall(-0.5, 0.5, 0.9, 0.9)];
  const nav = createNavigation(obstacles, 2, 1, 0);
  const from = { x: -0.5, z: -0.5 }, to = { x: 0.5, z: 0.5 };
  const path = nav.findPath(from, to);
  assert.ok(path.length > 1);
  assert.notDeepEqual(path[0], to, 'the apparently short diagonal is blocked');
  assert.deepEqual(path.at(-1), to);
  assertWalkable(nav, from, path, obstacles);
});

test('occupied endpoints snap to their nearest free cell', () => {
  const from = { x: -0.5, z: -2.5 }, to = { x: 0.5, z: 2.5 };
  const obstacles = [wall(from.x, from.z, 0.4, 0.4), wall(to.x, to.z, 0.4, 0.4)];
  const radius = 0.2, nav = createNavigation(obstacles, 4, 1, radius);
  const start = nearestFree(nav, from), goal = nearestFree(nav, to);
  const path = nav.findPath(from, to);
  assert.ok(path.length > 0);
  assert.equal(nav.blocked[idAt(nav, from)], 1);
  assert.equal(nav.blocked[idAt(nav, to)], 1);
  assert.deepEqual(path.at(-1), goal);
  assertWalkable(nav, start, path, obstacles, radius);
});

test('a destination isolated by a complete wall returns no route', () => {
  const nav = createNavigation([wall(0, 0, 1, 10)], 4, 1, 0.2);
  assert.deepEqual(nav.findPath({ x: -2.5, z: 0.5 }, { x: 2.5, z: 0.5 }), []);
});

test('a fully occupied arena returns no route', () => {
  const nav = createNavigation([wall(0, 0, 10, 10)], 4, 1, 0.2);
  assert.ok(nav.blocked.every(value => value === 1));
  assert.deepEqual(nav.findPath({ x: -2, z: -2 }, { x: 2, z: 2 }), []);
});

test('overhead geometry does not block movement underneath', () => {
  const nav = createNavigation([wall(0, 0, 10, 10, { y: 2.5, h: 1 })], 4, 1, 0.2);
  assert.ok(nav.blocked.every(value => value === 0));
  assert.equal(nav.findPath({ x: -3.5, z: -3.5 }, { x: 3.5, z: 3.5 }).length, 7);
});

test('thin walls between grid centres still block crossing edges', () => {
  const nav = createNavigation([wall(0, 0, 0.05, 10)], 4, 1, 0.1);
  assert.deepEqual(nav.findPath({ x: -2.5, z: 0.5 }, { x: 2.5, z: 0.5 }), []);
});
