const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// Camera-relative bearing: 0 = front, PI/2 = right, PI = behind.
export function threatBearing(source, position, yaw) {
  const dx = source.x - position.x, dz = source.z - position.z;
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const forward = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  return Math.atan2(right, forward);
}

export function createCombatFeedback() {
  let impact = 0, incoming = 0, directionLife = 0, source = null;
  let time = 0, heartbeatTimer = 0, alertTimer = 0, previousLevel = '';
  const empty = () => ({ level: '', title: '', detail: '', damageOpacity: 0,
    directionOpacity: 0, directionAngle: 0, heartbeat: false, alert: false });
  function reset() {
    impact = incoming = directionLife = time = heartbeatTimer = alertTimer = 0;
    source = null; previousLevel = '';
    return empty();
  }
  return {
    reset,
    hit(amount, origin) {
      impact = clamp(0.66 + amount / 90, 0.66, 1);
      incoming = 3;
      directionLife = origin ? 1.8 : 0;
      source = origin ? { x: origin.x, z: origin.z } : null;
    },
    shot() { incoming = 3; },
    update(dt, { hp, nearby = 0, position, yaw = 0, active = true, reducedEffects = false }) {
      if (!active) return reset();
      time += dt;
      impact = Math.max(0, impact - dt * 1.05);
      incoming = Math.max(0, incoming - dt);
      directionLife = Math.max(0, directionLife - dt);
      alertTimer = Math.max(0, alertTimer - dt);
      heartbeatTimer -= dt;
      const critical = hp <= 30;
      const level = critical ? 'critical' : incoming > 0 ? 'fire' : nearby > 0 ? 'near' : '';
      const title = critical ? 'SALUD CRÍTICA' : level === 'fire' ? 'BAJO FUEGO' : level === 'near' ? 'CONTACTO CERCANO' : '';
      const detail = critical ? 'BUSCA COBERTURA' : level === 'fire' ? 'LOCALIZA EL ATAQUE · CAMBIA DE POSICIÓN' : nearby > 1 ? 'VARIOS ENEMIGOS A CORTA DISTANCIA' : 'ENEMIGO A CORTA DISTANCIA';
      // Only transitions produce a cue; repeated shots cannot queue a siren.
      const alert = level !== previousLevel && !!level && alertTimer <= 0;
      if (alert) alertTimer = 4;
      previousLevel = level;
      const heartbeat = critical && heartbeatTimer <= 0;
      if (heartbeat) heartbeatTimer = 1.05;
      if (!critical) heartbeatTimer = 0;
      const pulse = critical ? 0.25 + 0.11 * (0.5 + 0.5 * Math.sin(time * Math.PI * 1.6)) : 0;
      return {
        level, title, detail: level ? detail : '', alert, heartbeat,
        damageOpacity: reducedEffects ? Math.max(impact * 0.2, critical ? 0.16 : 0) : Math.max(impact, pulse, incoming > 0 ? 0.065 : 0),
        directionOpacity: directionLife > 0 ? Math.min(1, directionLife / 0.45) : 0,
        directionAngle: source ? threatBearing(source, position, yaw) : 0,
      };
    },
  };
}
