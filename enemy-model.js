import * as THREE from 'three';

/**
 * A self-contained soldier facing +Z. Each instance owns its materials and
 * geometries, so the game's existing per-enemy disposal remains safe.
 * Limbs are meshes with geometry below their joint, not offset mesh centers.
 */
export function buildEnemyMesh(enemy) {
  const soldier = new THREE.Group();
  soldier.name = 'dustline-soldier';
  const material = (color, roughness = 0.88, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const cloth = material(0x69715a);
  const armor = material(0x39473e);
  const dark = material(0x252e2b);
  const skin = material(0xab8c70);
  const helmet = material(0x56634b);
  const glass = material(0x789b98, 0.25, 0.45);
  const metal = material(0x4d5652, 0.45, 0.55);
  const band = material(0xb24936);
  enemy.flashMats = [cloth, armor, dark, skin, helmet, metal, band];
  enemy.hitMeshes = [];

  const transform = (geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
    return geometry.applyMatrix4(matrix);
  };

  // Combine static equipment of the same material into a single draw call.
  // Inputs are temporary geometries; only the combined geometry is retained.
  const combine = (parts) => {
    const positions = [], normals = [];
    for (const source of parts) {
      const flat = source.index ? source.toNonIndexed() : source;
      positions.push(...flat.attributes.position.array);
      normals.push(...flat.attributes.normal.array);
      if (flat !== source) flat.dispose();
      source.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    return geometry;
  };

  const chamferBox = (width, height, depth, bevel = 0.012) => {
    const b = Math.min(bevel, width / 5, height / 5, depth / 5);
    const x = width / 2 - b, y = height / 2 - b;
    const outline = new THREE.Shape();
    outline.moveTo(-x, -y); outline.lineTo(x, -y); outline.lineTo(x, y);
    outline.lineTo(-x, y); outline.closePath();
    return new THREE.ExtrudeGeometry(outline, {
      depth: depth - b * 2, bevelEnabled: true, bevelThickness: b,
      bevelSize: b, bevelSegments: 1, steps: 1, curveSegments: 1,
    }).translate(0, 0, -depth / 2 + b);
  };

  const segment = (a, b, radius) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.005, delta.length() - radius * 2), 2, 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    return geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
  };

  const mesh = (geometry, mat, parent, x = 0, y = 0, z = 0, hitPart = 'body') => {
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    if (hitPart) {
      object.userData = { enemy, part: hitPart };
      enemy.hitMeshes.push(object);
    }
    return object;
  };

  // Tapered shoulders, a narrow waist and separate armor break up the silhouette.
  mesh(transform(new THREE.CylinderGeometry(0.265, 0.19, 0.57, 8), 0, 0, 0, 0, Math.PI / 8, 0, 1, 1, 0.68), cloth, soldier, 0, 1.125, 0);
  mesh(combine([
    transform(chamferBox(0.355, 0.36, 0.07), 0, 1.16, 0.155),
    transform(chamferBox(0.33, 0.37, 0.065), 0, 1.16, -0.155),
    transform(chamferBox(0.085, 0.17, 0.068), -0.1, 1.09, 0.211),
    transform(chamferBox(0.085, 0.17, 0.068), 0, 1.09, 0.211),
    transform(chamferBox(0.085, 0.17, 0.068), 0.1, 1.09, 0.211),
  ]), armor, soldier);
  mesh(combine([
    transform(chamferBox(0.405, 0.075, 0.285), 0, 0.88, 0),
    transform(chamferBox(0.053, 0.42, 0.055), -0.155, 1.215, 0.14, 0, 0, -0.085),
    transform(chamferBox(0.053, 0.42, 0.055), 0.155, 1.215, 0.14, 0, 0, 0.085),
    transform(new THREE.CylinderGeometry(0.078, 0.09, 0.105, 8), 0, 1.435, 0),
  ]), dark, soldier);

  // The visible head, mask, visor and helmet all count as headshots.
  mesh(transform(new THREE.SphereGeometry(0.145, 10, 7), 0, 0, 0, 0, 0, 0, 0.9, 1, 0.9), skin, soldier, 0, 1.58, 0, 'head');
  mesh(combine([
    transform(new THREE.SphereGeometry(0.18, 10, 5, 0, Math.PI * 2, 0, 1.4), 0, 1.61, 0, 0, 0, 0, 1, 1, 0.96),
    transform(chamferBox(0.25, 0.025, 0.13, 0.007), 0, 1.651, 0.111),
  ]), helmet, soldier, 0, 0, 0, 'head');
  mesh(chamferBox(0.227, 0.052, 0.037, 0.008), glass, soldier, 0, 1.612, 0.125, 'head');
  mesh(transform(new THREE.SphereGeometry(0.1, 8, 5), 0, 0, 0, 0, 0, 0, 1.08, 0.66, 0.5), dark, soldier, 0, 1.528, 0.112, 'head');

  // Both leg meshes pivot at the hips. Kneepads and boots inherit that motion.
  const legGeometry = combine([
    segment([0, -0.035, 0], [0, -0.365, 0.017], 0.086),
    segment([0, -0.35, 0.017], [0, -0.71, -0.014], 0.071),
  ]);
  const legEquipment = combine([
    transform(chamferBox(0.135, 0.16, 0.052), 0, -0.38, 0.086, -0.08),
    transform(chamferBox(0.16, 0.145, 0.245, 0.025), 0, -0.7475, 0.036),
  ]);
  enemy.legL = mesh(legGeometry, cloth, soldier, -0.108, 0.82, 0);
  enemy.legR = mesh(legGeometry, cloth, soldier, 0.108, 0.82, 0);
  mesh(legEquipment, dark, enemy.legL);
  mesh(legEquipment, dark, enemy.legR);

  const makeArm = (side) => {
    const elbow = [-side * 0.03, -0.2, 0.008];
    const wrist = side < 0 ? [0.33, -0.45, 0.05] : [-0.225, -0.305, -0.035];
    const arm = mesh(combine([
      segment([0, 0, 0], elbow, 0.075),
      segment(elbow, wrist, 0.059),
    ]), cloth, soldier, side * 0.285, 1.35, 0);
    mesh(combine([
      transform(chamferBox(0.115, 0.092, 0.11, 0.018), ...wrist),
      transform(new THREE.SphereGeometry(0.088, 8, 5), side * 0.018, -0.015, 0, 0, 0, 0, 0.85, 1.15, 0.85),
    ]), dark, arm);
    arm.rotation.x = -1.15;
    return arm;
  };
  enemy.armL = makeArm(-1);
  enemy.armR = makeArm(1);
  mesh(chamferBox(0.154, 0.07, 0.148, 0.009), band, enemy.armR, -0.012, -0.105, 0);

  // Gun follows the right arm's recoil. Counter-rotation makes its barrel face
  // +Z at the animation's existing resting angle of -1.15 radians.
  const weapon = new THREE.Group();
  weapon.position.set(-0.235, -0.333, 0.075);
  weapon.rotation.x = 1.15;
  enemy.armR.add(weapon);
  mesh(combine([
    chamferBox(0.08, 0.10, 0.28, 0.012),
    transform(new THREE.CylinderGeometry(0.017, 0.017, 0.18, 6), 0, 0.022, 0.21, Math.PI / 2),
    transform(chamferBox(0.025, 0.049, 0.04, 0.005), 0, 0.073, 0.045),
  ]), metal, weapon);
  mesh(combine([
    transform(chamferBox(0.07, 0.085, 0.18), 0, -0.01, -0.205),
    transform(chamferBox(0.09, 0.094, 0.14), 0, 0.005, 0.101),
    transform(chamferBox(0.048, 0.135, 0.069), 0, -0.102, -0.003, -0.17),
    transform(chamferBox(0.053, 0.09, 0.055), 0, -0.078, -0.095, -0.25),
  ]), dark, weapon);

  soldier.updateMatrixWorld(true);
  return soldier;
}
