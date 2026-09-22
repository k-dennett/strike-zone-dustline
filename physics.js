// Entity position denotes the centre in X/Z and the feet in Y. Gravity and
// fixed-step accumulation belong to the caller; colliders use { min, max }.
function overlaps(entity, box) {
  return entity.pos.x + entity.r > box.min.x && entity.pos.x - entity.r < box.max.x &&
    entity.pos.z + entity.r > box.min.z && entity.pos.z - entity.r < box.max.z &&
    entity.pos.y + entity.h > box.min.y && entity.pos.y < box.max.y;
}

function resolveAxis(entity, axis, colliders) {
  for (const box of colliders) {
    if (!overlaps(entity, box)) continue;

    const vertical = axis === 'y';
    const before = box.min[axis] - (vertical ? entity.h : entity.r);
    const after = box.max[axis] + (vertical ? 0 : entity.r);
    const velocity = entity.vel[axis];
    let resolved;
    if (velocity > 0) resolved = before;
    else if (velocity < 0) resolved = after;
    else {
      // Crowd separation can introduce overlap without axis velocity. Choose
      // the nearest face instead of always teleporting to the positive side.
      resolved = Math.abs(entity.pos[axis] - before) <= Math.abs(after - entity.pos[axis])
        ? before : after;
    }

    entity.pos[axis] = resolved;
    entity.vel[axis] = 0;
    if (vertical && resolved === after) entity.grounded = true;
  }
}

export function moveEntity(entity, dt, colliders, arenaHalf = 30) {
  entity.pos.x += entity.vel.x * dt;
  resolveAxis(entity, 'x', colliders);
  entity.pos.z += entity.vel.z * dt;
  resolveAxis(entity, 'z', colliders);
  entity.pos.y += entity.vel.y * dt;
  entity.grounded = false;
  if (entity.pos.y <= 0) {
    entity.pos.y = 0;
    entity.vel.y = 0;
    entity.grounded = true;
  }
  resolveAxis(entity, 'y', colliders);
  entity.pos.x = Math.max(-arenaHalf + entity.r, Math.min(arenaHalf - entity.r, entity.pos.x));
  entity.pos.z = Math.max(-arenaHalf + entity.r, Math.min(arenaHalf - entity.r, entity.pos.z));
}
