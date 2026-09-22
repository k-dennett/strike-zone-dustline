import test from 'node:test';
import assert from 'node:assert/strict';
import { moveEntity } from '../physics.js';

const STEP = 1 / 120;
const GRAVITY = 22;
const entity = (pos = {}, vel = {}) => ({
  pos: { x: 0, y: 0, z: 0, ...pos },
  vel: { x: 0, y: 0, z: 0, ...vel },
  r: 0.35, h: 1.75, grounded: false,
});
const box = (min, max) => ({ min, max });
const close = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${label}: expected ${expected}, got ${actual}`);

test('ground arrests falling and keeps a gravity-driven entity stable', () => {
  const body = entity({ y: 0.01 }, { y: -4 });
  moveEntity(body, STEP, []);
  assert.equal(body.pos.y, 0);
  assert.equal(body.vel.y, 0);
  assert.equal(body.grounded, true);
  for (let i = 0; i < 240; i++) {
    body.vel.y -= GRAVITY * STEP;
    moveEntity(body, STEP, []);
  }
  assert.equal(body.pos.y, 0);
  assert.equal(body.grounded, true);
});

function jumpAtDisplayRate(fps) {
  const body = entity({}, { x: 1, y: 8.2 });
  let accumulator = 0;
  let peak = 0;
  let ticks = 0;
  for (let frame = 0; frame < fps * 2; frame++) {
    accumulator += 1 / fps;
    while (accumulator >= STEP) {
      body.vel.y -= GRAVITY * STEP;
      moveEntity(body, STEP, []);
      accumulator -= STEP;
      ticks++;
      peak = Math.max(peak, body.pos.y);
    }
  }
  return { peak, body, ticks };
}

test('120 Hz physics produces the same jump and displacement at 20/30/60/120 display FPS', () => {
  const reference = jumpAtDisplayRate(120);
  close(reference.peak, 1.4941666666666653, 'jump height');
  assert.equal(reference.ticks, 240);
  for (const fps of [20, 30, 60, 120]) {
    const result = jumpAtDisplayRate(fps);
    assert.equal(result.ticks, reference.ticks, `${fps} FPS step count`);
    close(result.peak, reference.peak, `${fps} FPS peak`);
    close(result.body.pos.x, reference.body.pos.x, `${fps} FPS displacement`);
    assert.equal(result.body.pos.y, 0);
    assert.equal(result.body.grounded, true);
  }
});

test('walls stop horizontal movement from both sides and permit sliding', () => {
  const wall = box({ x: 1, y: 0, z: -5 }, { x: 2, y: 4, z: 5 });
  const left = entity({ x: 0.63 }, { x: 4.9, z: 2 });
  moveEntity(left, STEP, [wall]);
  close(left.pos.x, 0.65);
  assert.equal(left.vel.x, 0);
  close(left.pos.z, 2 * STEP, 'sliding on Z remains possible');
  const right = entity({ x: 2.37 }, { x: -4.9 });
  moveEntity(right, STEP, [wall]);
  close(right.pos.x, 2.35);
  assert.equal(right.vel.x, 0);
});

test('a stationary overlap resolves through the nearest face, including negative sides', () => {
  const obstacle = box({ x: 1, y: 0, z: 1 }, { x: 2, y: 4, z: 2 });
  const nearLeft = entity({ x: 0.7, z: 1.5 });
  moveEntity(nearLeft, 0, [obstacle]);
  close(nearLeft.pos.x, 0.65, 'near negative X face must not teleport to positive X');
  close(nearLeft.pos.z, 1.5);
  const nearRight = entity({ x: 2.3, z: 1.5 });
  moveEntity(nearRight, 0, [obstacle]);
  close(nearRight.pos.x, 2.35);
});

test('ceiling collision cancels upward motion without grounding the entity', () => {
  const ceiling = box({ x: -2, y: 2.5, z: -2 }, { x: 2, y: 3, z: 2 });
  const body = entity({ y: 0.73 }, { y: 8 });
  moveEntity(body, STEP, [ceiling]);
  close(body.pos.y, 0.75);
  assert.equal(body.vel.y, 0);
  assert.equal(body.grounded, false);
});

test('a falling entity lands on a crate and remains supported under gravity', () => {
  const crate = box({ x: -1, y: 0, z: -1 }, { x: 1, y: 1.4, z: 1 });
  const body = entity({ y: 1.42 }, { y: -5 });
  moveEntity(body, STEP, [crate]);
  close(body.pos.y, 1.4);
  assert.equal(body.vel.y, 0);
  assert.equal(body.grounded, true);
  for (let i = 0; i < 120; i++) {
    body.vel.y -= GRAVITY * STEP;
    moveEntity(body, STEP, [crate]);
  }
  close(body.pos.y, 1.4);
  close(body.pos.x, 0);
  close(body.pos.z, 0);
  assert.equal(body.grounded, true);
});

test('arena boundaries clamp the complete entity radius', () => {
  const body = entity({ x: 29.6, z: -29.6 }, { x: 8, z: -8 });
  moveEntity(body, 0.1, []);
  close(body.pos.x, 29.65);
  close(body.pos.z, -29.65);
});
