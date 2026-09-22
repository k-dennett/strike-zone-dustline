import * as THREE from 'three';

/**
 * Art pass for the existing arena. All architectural mass is outside the arena;
 * inside it, decorations sit against existing surfaces or above jump height.
 * The original collision and sight-line geometry remains authoritative.
 */
export function enhanceWorld({ scene, renderer, camera, pieces = [], worldMeshes = [], sites = [] }) {
  const root = new THREE.Group();
  root.name = 'Dustline environmental art';
  scene.add(root);
  let seed = 281114;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range = (a, b) => a + random() * (b - a);
  const canvasTexture = (width, height, draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...extra });
  const mats = {
    sand: material(0xd0b98f), pale: material(0xe0cda5), ochre: material(0xb99367),
    terra: material(0xc29272), cream: material(0xe9d5aa), trim: material(0xf2dbaf),
    dark: material(0x343c3c), recess: material(0x253d40), teal: material(0x38787b),
    brass: material(0xa99c77, { metalness: 0.5, roughness: 0.52 }),
    timber: material(0x705d45), cable: material(0x313738),
  };

  scene.background = new THREE.Color(0xbdd8dc);
  scene.fog = new THREE.Fog(0xd7d8c8, 48, 145);
  renderer.toneMappingExposure = 1.08;
  scene.children.forEach((child) => {
    if (child.isHemisphereLight) {
      child.color.set(0xc8e8f0);
      child.groundColor.set(0x927449);
      child.intensity = 1.35;
    }
    if (child.isDirectionalLight) {
      child.color.set(0xffdfab);
      child.intensity = 2.5;
      child.position.set(-25, 38, 24);
      child.shadow.normalBias = 0.025;
      child.shadow.bias = -0.00015;
    }
  });

  // A quiet vertical sky gradient lends depth without a post-processing pass.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { topColor: { value: new THREE.Color(0x78b9cc) }, bottomColor: { value: new THREE.Color(0xeee2c1) } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vDirection;
      void main(){
        float h=clamp(normalize(vDirection).y,0.0,1.0);
        gl_FragColor=vec4(mix(bottomColor,topColor,pow(h,0.52)),1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10;
  root.add(sky);

  // Geometry shared by every block; one draw call per material for the city.
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map();
  const addBlock = (mat, x, y, z, w, h, d, yaw = 0) => {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ x, y, z, w, h, d, yaw });
  };
  const addMesh = (geometry, mat, x, y, z, rotationY = 0) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    root.add(mesh);
    return mesh;
  };
  const addPanel = (map, x, y, z, w, h, yaw = 0, transparent = false) => {
    return addMesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map, roughness: 1, transparent, polygonOffset: true, polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    }), x, y, z, yaw);
  };

  const limestone = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#d2bc92'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6800; i++) {
      g.fillStyle = random() > 0.5 ? 'rgba(255,246,210,.09)' : 'rgba(87,66,38,.06)';
      g.fillRect(random() * w, random() * h, range(1, 4), range(1, 3));
    }
    g.strokeStyle = 'rgba(101,82,53,.12)'; g.lineWidth = 2;
    for (let row = 0; row < 8; row++) {
      g.beginPath(); g.moveTo(0, row * 64); g.lineTo(w, row * 64); g.stroke();
      for (let col = 0; col < 5; col++) {
        const x = col * 128 + (row % 2) * 64;
        g.beginPath(); g.moveTo(x, row * 64); g.lineTo(x, row * 64 + 64); g.stroke();
      }
    }
  });
  limestone.wrapS = limestone.wrapT = THREE.RepeatWrapping;
  const wallMaterial = material(0xffffff, { map: limestone });
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const mesh = worldMeshes[i + 1];
    if (p.mat === 'wall' && mesh) mesh.material = wallMaterial;
    const base = p.y || 0;
    if (p.mat === 'wall') {
      // Cornices and dark plinths stay almost flush with existing collision boxes.
      addBlock(mats.trim, p.x, base + p.h - 0.1, p.z, p.w + 0.035, 0.2, p.d + 0.035);
      addBlock(mats.ochre, p.x, base + 0.22, p.z, p.w + 0.02, 0.43, p.d + 0.02);
      if (p.w < 2 && p.d < 2) {
        addBlock(mats.teal, p.x, base + p.h - 0.4, p.z, p.w + 0.02, 0.2, p.d + 0.02);
        addBlock(mats.trim, p.x, base + 0.8, p.z, p.w + 0.02, 0.1, p.d + 0.02);
      }
    } else {
      // Real metal bands and corner guards give crates readable silhouettes.
      for (const offset of [-0.34, 0.34]) {
        addBlock(mats.brass, p.x + p.w * offset, base + p.h / 2, p.z, 0.06, p.h + 0.025, p.d + 0.025);
        addBlock(mats.timber, p.x, base + p.h * (offset + 0.5), p.z, p.w + 0.025, 0.07, p.d + 0.025);
      }
    }
  }

  const floorMap = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#bbaa88'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18000; i++) {
      g.fillStyle = random() > 0.45 ? 'rgba(242,224,186,.10)' : 'rgba(92,79,54,.10)';
      g.fillRect(random() * w, random() * h, range(1, 4), range(1, 3));
    }
    // Wide paving slabs weathered by sand.
    g.strokeStyle = 'rgba(96,85,64,.18)'; g.lineWidth = 2;
    for (let row = 0; row < 8; row++) {
      g.beginPath(); g.moveTo(0, row * 128); g.lineTo(w, row * 128); g.stroke();
      for (let col = 0; col < 8; col++) {
        const x = col * 256 + (row % 2) * 128;
        g.beginPath(); g.moveTo(x, row * 128); g.lineTo(x, row * 128 + 128); g.stroke();
      }
    }
    for (let i = 0; i < 25; i++) {
      const x = random() * w, y = random() * h;
      const gradient = g.createRadialGradient(x, y, 2, x, y, range(60, 220));
      gradient.addColorStop(0, 'rgba(226,202,155,.38)'); gradient.addColorStop(1, 'rgba(226,202,155,0)');
      g.fillStyle = gradient; g.fillRect(0, 0, w, h);
    }
  });
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping;
  floorMap.repeat.set(8, 8);
  if (worldMeshes[0]) worldMeshes[0].material = material(0xffffff, { map: floorMap });

  const markings = canvasTexture(1024, 1024, (g, w) => {
    const coord = (v) => ((v + 30) / 60) * w;
    g.strokeStyle = 'rgba(241,222,164,.45)'; g.lineWidth = 3;
    g.setLineDash([13, 17]);
    for (const x of [-4.7, 4.7]) { g.beginPath(); g.moveTo(coord(x), coord(-27)); g.lineTo(coord(x), coord(27)); g.stroke(); }
    g.setLineDash([]);
    for (const site of sites) {
      const x = coord(site.x), y = coord(site.z);
      g.save(); g.translate(x, y);
      g.strokeStyle = site.name === 'A' ? 'rgba(225,136,63,.72)' : 'rgba(66,133,134,.72)';
      g.lineWidth = 5; g.strokeRect(-70, -70, 140, 140);
      g.fillStyle = site.name === 'A' ? 'rgba(221,144,71,.62)' : 'rgba(62,133,136,.62)';
      g.font = '900 94px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(site.name, 0, 0); g.restore();
    }
    // Abraded paint instead of perfectly clean UI pasted on the floor.
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 15000; i++) {
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(random() * w, random() * w, range(1, 4), range(1, 3));
    }
  });
  const markingsMesh = addPanel(markings, 0, 0.013, 0, 60, 60, 0, true);
  markingsMesh.rotation.x = -Math.PI / 2;
  markingsMesh.material.depthWrite = false;

  const shutter = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#375b5b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#284a4b'; g.fillRect(7, 7, w - 14, h - 14);
    for (let y = 15; y < h - 10; y += 11) {
      g.fillStyle = '#487878'; g.fillRect(12, y, w - 24, 6);
      g.fillStyle = '#223f40'; g.fillRect(12, y + 6, w - 24, 3);
    }
    g.fillStyle = '#4c7472'; g.fillRect(w / 2 - 3, 5, 6, h - 10);
    g.fillStyle = '#b4a77e'; g.fillRect(w / 2 - 9, h / 2, 5, 13);
  });
  const door = canvasTexture(256, 384, (g, w, h) => {
    g.fillStyle = '#b09168'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ebd1a4';
    g.beginPath(); g.moveTo(12, h); g.lineTo(12, 106); g.quadraticCurveTo(w / 2, -95, w - 12, 106); g.lineTo(w - 12, h); g.fill();
    g.fillStyle = '#254849';
    g.beginPath(); g.moveTo(29, h); g.lineTo(29, 111); g.quadraticCurveTo(w / 2, -50, w - 29, 111); g.lineTo(w - 29, h); g.fill();
    for (let x = 41; x < w - 29; x += 22) { g.fillStyle = '#376563'; g.fillRect(x, 117, 17, h); }
    g.strokeStyle = '#182f32'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, 45); g.lineTo(w / 2, h); g.stroke();
    g.fillStyle = '#bc9a5c'; g.fillRect(w / 2 - 17, 247, 8, 19); g.fillRect(w / 2 + 9, 247, 8, 19);
  });
  const signTexture = (title, subtitle, background = '#234d51') => canvasTexture(768, 256, (g, w, h) => {
    g.fillStyle = background; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#cbbf94'; g.lineWidth = 5; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#f4e3b8'; g.textAlign = 'center'; g.font = '900 92px sans-serif'; g.fillText(title, w / 2, 124);
    g.font = 'bold 27px monospace'; g.fillStyle = '#bebc9d'; g.fillText(subtitle, w / 2, 183);
    for (const x of [23, w - 23]) for (const y of [23, h - 23]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  });
  const cargoLabel = signTexture('07 / DL', 'TACTICAL SUPPLY', '#646b5c');
  for (const p of pieces.filter((p) => p.mat === 'crate' && !p.y)) {
    addPanel(cargoLabel, p.x, p.h * 0.58, p.z + p.d / 2 + 0.021, p.w * 0.55, p.w * 0.18);
  }

  // The old blank perimeter is now a continuous, hand-authored street facade.
  const facades = [
    { x: 0, z: -29.987, yaw: 0 }, { x: 0, z: 29.987, yaw: Math.PI },
    { x: -29.987, z: 0, yaw: Math.PI / 2 }, { x: 29.987, z: 0, yaw: -Math.PI / 2 },
  ];
  for (const facade of facades) {
    const point = (x, depth = 0) => [facade.x + x * Math.cos(facade.yaw) + depth * Math.sin(facade.yaw), facade.z - x * Math.sin(facade.yaw) + depth * Math.cos(facade.yaw)];
    for (let x = -26; x <= 26; x += 6.5) {
      const [wx, wz] = point(x, 0.012);
      addPanel(shutter, wx, 3.63, wz, 0.86, 1.3, facade.yaw);
      const [tx, tz] = point(x);
      addBlock(mats.trim, tx, 4.36, tz, 1.15, 0.16, 0.035, facade.yaw);
      addBlock(mats.trim, tx, 2.93, tz, 1.12, 0.14, 0.035, facade.yaw);
    }
    for (const x of [-22, -9, 9, 22]) {
      const [wx, wz] = point(x, 0.017);
      addPanel(door, wx, 1.45, wz, 1.95, 2.9, facade.yaw);
    }
    for (let x = -29; x < 30; x += 9.7) {
      const [wx, wz] = point(x);
      addBlock(mats.pale, wx, 2.5, wz, 0.3, 5, 0.04, facade.yaw);
    }
    const [sx, sz] = point(0, 0.028);
    addPanel(signTexture('DUSTLINE', 'OLD TOWN / RESTRICTED AREA'), sx, 2.5, sz, 5.5, 1.83, facade.yaw);
  }
  addPanel(signTexture('SECTOR A', '01  /  EAST COMPOUND', '#865d39'), 18, 3.7, -29.944, 5.8, 1.93);
  addPanel(signTexture('SECTOR B', '02  /  WEST COMPOUND'), -18, 3.7, 29.944, 5.8, 1.93, Math.PI);
  addPanel(signTexture('A  >', 'EAST / OBJECTIVE', '#865d39'), 12.5, 2.15, 0.624, 3, 1);
  addPanel(signTexture('<  B', 'WEST / OBJECTIVE'), -12.5, 2.15, -0.624, 3, 1, Math.PI);

  // Buildings sit beyond the collision perimeter and create an inhabited horizon.
  const buildingPalette = [mats.sand, mats.pale, mats.ochre, mats.terra, mats.cream];
  const building = (x, z, w, d, h, index) => {
    addBlock(buildingPalette[index % buildingPalette.length], x, h / 2, z, w, h, d);
    addBlock(mats.trim, x, h - 0.15, z, w + 0.25, 0.35, d + 0.25);
    addBlock(mats.ochre, x, h + 0.4, z - d / 2 + 0.2, w, 0.7, 0.35);
    addBlock(mats.ochre, x, h + 0.4, z + d / 2 - 0.2, w, 0.7, 0.35);
    addBlock(mats.ochre, x - w / 2 + 0.2, h + 0.4, z, 0.35, 0.7, d);
    addBlock(mats.ochre, x + w / 2 - 0.2, h + 0.4, z, 0.35, 0.7, d);
    for (let y = 6.5; y < h - 1; y += 3) {
      for (let dx = -w / 2 + 1.6; dx < w / 2 - 0.8; dx += 2.6) {
        for (const side of [-1, 1]) {
          addBlock(mats.recess, x + dx, y, z + side * (d / 2 + 0.025), 0.9, 1.45, 0.04);
          addBlock(mats.trim, x + dx, y - 0.8, z + side * (d / 2 + 0.08), 1.15, 0.13, 0.25);
          if ((index + Math.round(dx)) % 2 === 0) addBlock(mats.teal, x + dx, y, z + side * (d / 2 + 0.05), 0.65, 1.2, 0.025);
        }
      }
      for (let dz = -d / 2 + 1.4; dz < d / 2 - 0.8; dz += 2.6) {
        for (const side of [-1, 1]) {
          addBlock(mats.recess, x + side * (w / 2 + 0.025), y, z + dz, 0.04, 1.4, 0.85);
          addBlock(mats.trim, x + side * (w / 2 + 0.08), y - 0.8, z + dz, 0.25, 0.13, 1.1);
        }
      }
    }
    if (index % 3 === 0) {
      const tank = addMesh(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 12), mats.teal, x + 1.1, h + 1.2, z);
      tank.castShadow = true;
      addBlock(mats.dark, x + 1.1, h + 0.2, z, 1.5, 0.4, 1.5);
    }
    if (index % 2 === 0) {
      addBlock(mats.dark, x - 1, h + 1.5, z + 1, 0.035, 3, 0.035);
      addBlock(mats.dark, x - 1, h + 2.5, z + 1, 1.4, 0.035, 0.035);
      addBlock(mats.dark, x - 1, h + 2.15, z + 1, 0.8, 0.035, 0.035);
    }
  };
  for (let i = 0; i < 7; i++) {
    building(-34 + i * 11.5, -38 - range(0, 3), range(8, 11), range(9, 12), range(9, 16), i);
    building(-34 + i * 11.5, 39 + range(0, 4), range(8, 11), range(9, 12), range(8, 13), i + 9);
  }
  for (let i = 0; i < 5; i++) {
    building(-39 - range(0, 2), -25 + i * 12, range(9, 12), range(8, 10), range(8, 15), i + 17);
    building(39 + range(0, 2), -25 + i * 12, range(9, 12), range(8, 10), range(8, 14), i + 22);
  }

  // A recognizable navigation landmark above the northeast skyline.
  const towerX = 43, towerZ = -43;
  addMesh(new THREE.CylinderGeometry(2.7, 3.2, 21, 8), mats.pale, towerX, 10.5, towerZ);
  addMesh(new THREE.CylinderGeometry(3.35, 3.35, 0.6, 8), mats.trim, towerX, 18.6, towerZ);
  addMesh(new THREE.CylinderGeometry(2.1, 2.5, 3.3, 8), mats.ochre, towerX, 22.6, towerZ);
  addMesh(new THREE.ConeGeometry(2.7, 3, 8), mats.teal, towerX, 25.7, towerZ);
  addBlock(mats.brass, towerX, 28, towerZ, 0.1, 2, 0.1);

  const cableMaterial = mats.cable;
  const addCable = (points) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return addMesh(new THREE.TubeGeometry(curve, 24, 0.018, 4, false), cableMaterial, 0, 0, 0);
  };
  addCable([[-30, 7.8, -12], [0, 6.4, -9], [30, 8, -6]]);
  addCable([[-30, 7, 18], [0, 6.1, 16], [30, 7.7, 14]]);

  const clothTexture = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#397b7c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = '#b7bba0'; g.fillRect(x, 0, 14, h); }
    for (let i = 0; i < 2000; i++) { g.fillStyle = 'rgba(255,245,209,.09)'; g.fillRect(random() * w, random() * h, 1, 2); }
  });
  clothTexture.wrapS = clothTexture.wrapT = THREE.RepeatWrapping;
  clothTexture.repeat.set(3, 1);
  const clothMaterial = material(0xffffff, { map: clothTexture, side: THREE.DoubleSide });
  const cloths = [];
  for (const [x, z, yaw] of [[22, -26.6, 0], [-22, 26.6, Math.PI]]) {
    const geometry = new THREE.PlaneGeometry(11, 5.8, 18, 8);
    const cloth = addMesh(geometry, clothMaterial, x, 5.7, z, yaw);
    cloth.rotation.x = -Math.PI / 2;
    cloth.castShadow = true; cloth.receiveShadow = true;
    cloths.push({ mesh: cloth, original: Float32Array.from(geometry.attributes.position.array) });
    addCable([[x - 5.5, 5.7, z - 2.9], [x, 5.55, z - 2.9], [x + 5.5, 5.7, z - 2.9]]);
    addCable([[x - 5.5, 5.7, z + 2.9], [x, 5.55, z + 2.9], [x + 5.5, 5.7, z + 2.9]]);
  }

  // Low-cost distant palms, beyond the walls; the 28 fronds share one draw call.
  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.72, 0.12, 1.55, 0, -1.1, 3.8,
    0, 0, 0, 0, -1.1, 3.8, -0.72, 0.12, 1.55,
  ], 3));
  leafGeometry.computeVertexNormals();
  const leaves = new THREE.InstancedMesh(leafGeometry, material(0x687d55, { side: THREE.DoubleSide }), 28);
  const leafTransform = new THREE.Object3D();
  let leafIndex = 0;
  for (const [x, z, h] of [[-35, -26, 10], [35, 18, 12], [-36, 20, 11], [24, -34, 10]]) {
    const trunk = addMesh(new THREE.CylinderGeometry(0.16, 0.38, h, 7), mats.timber, x, h / 2, z);
    trunk.castShadow = true;
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      leafTransform.position.set(x, h, z);
      leafTransform.rotation.y = angle;
      leafTransform.updateMatrix();
      leaves.setMatrixAt(leafIndex++, leafTransform.matrix);
    }
  }
  leaves.computeBoundingSphere();
  root.add(leaves);

  const transform = new THREE.Object3D();
  for (const [mat, items] of batches) {
    const instances = new THREE.InstancedMesh(blockGeometry, mat, items.length);
    instances.name = 'Instanced architecture';
    items.forEach((p, i) => {
      transform.position.set(p.x, p.y, p.z);
      transform.rotation.set(0, p.yaw, 0);
      transform.scale.set(p.w, p.h, p.d);
      transform.updateMatrix();
      instances.setMatrixAt(i, transform.matrix);
    });
    instances.castShadow = true; instances.receiveShadow = true;
    instances.computeBoundingSphere();
    root.add(instances);
  }

  const dustCount = 150;
  const dustPositions = new Float32Array(dustCount * 3);
  const drift = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = range(-29, 29);
    dustPositions[i * 3 + 1] = range(0.25, 7);
    dustPositions[i * 3 + 2] = range(-29, 29);
    drift[i] = range(0.1, 0.32);
  }
  const dustTexture = canvasTexture(32, 32, (g) => {
    const gradient = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,239,192,.65)'); gradient.addColorStop(1, 'rgba(255,239,192,0)');
    g.fillStyle = gradient; g.fillRect(0, 0, 32, 32);
  });
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    map: dustTexture, color: 0xffe4ac, size: 0.07, transparent: true,
    opacity: 0.48, depthWrite: false, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  root.add(dust);

  let highQuality = true;
  return {
    root,
    update(dt, time) {
      sky.position.copy(camera.position);
      if (!highQuality) return;
      for (let i = 0; i < dustCount; i++) {
        const at = i * 3;
        dustPositions[at] += dt * drift[i];
        dustPositions[at + 1] += Math.sin(time * 0.65 + i) * dt * 0.06;
        dustPositions[at + 2] += dt * 0.07;
        if (dustPositions[at] > 29) dustPositions[at] = -29;
        if (dustPositions[at + 2] > 29) dustPositions[at + 2] = -29;
      }
      dustGeometry.attributes.position.needsUpdate = true;
      for (const cloth of cloths) {
        const positions = cloth.mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const x = cloth.original[i * 3], y = cloth.original[i * 3 + 1];
          const envelope = Math.sin(((x + 5.5) / 11) * Math.PI);
          positions.setZ(i, envelope * (-0.3 + 0.075 * Math.sin(x * 1.5 + time * 1.8) + 0.035 * Math.sin(y * 2 + time)));
        }
        positions.needsUpdate = true;
        cloth.mesh.geometry.computeVertexNormals();
      }
    },
    setQuality(value) {
      highQuality = value !== 'low' && value !== false;
      dust.visible = highQuality;
    },
  };
}
