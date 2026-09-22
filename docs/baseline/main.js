import * as THREE from 'three';

/* ================= CONFIG ================= */
const ARENA_HALF = 30;
const EYE_HEIGHT = 1.62;
const GRAVITY = 22;

const WEAPONS = {
  rifle:  { name: 'AK-47', auto: true,  rpm: 600, dmg: 34, headMult: 4, mag: 30, reserve: 90, reloadTime: 2.2, spread: 0.011, kick: 0.014, tracer: 0xffe08a },
  pistol: { name: 'USP',   auto: false, rpm: 330, dmg: 26, headMult: 3, mag: 12, reserve: 48, reloadTime: 1.5, spread: 0.007, kick: 0.010, tracer: 0xbfe3ff },
};

const SITES = [
  { name: 'A', x: 18, z: -18, r: 5.5 },
  { name: 'B', x: -18, z: 18, r: 5.5 },
];

/* ================= ESTADO ================= */
const player = {
  pos: new THREE.Vector3(0, 0, 24),
  vel: new THREE.Vector3(),
  r: 0.35, h: 1.75,
  yaw: 0, pitch: 0,
  hp: 100, alive: true, grounded: true,
  weaponKey: 'rifle',
  ammo: { rifle: { mag: 30, reserve: 90 }, pistol: { mag: 12, reserve: 48 } },
  fireTimer: 0, reloadTimer: 0, switchTimer: 0,
  bloom: 0, ads: 0, adsTarget: 0, recoil: 0, recoilKick: 0,
  firing: false, walkT: 0, stepT: 0,
};

let started = false, paused = false, locked = false;
let gameMode = 'survival';            // 'survival' | 'bomb'
let wave = 0, kills = 0, spawnQueue = 0, spawnTimer = 0, intermission = -1;
let round = 0, trickleTimer = 0, roundEndT = 0;
let grenadeCount = 2;
let flashTTL = 0, boomTTL = 0, damageFlash = 0, messageTimer = 0, shake = 0;
let botObjective = null;              // Vector3: a dónde corren los bots (bomba plantada)

const colliders = [];     // THREE.Box3 para física
const worldMeshes = [];   // para raycasts (balas y línea de visión)
const enemies = [];
const grenades = [];

const bomb = { carried: false, planted: false, pos: new THREE.Vector3(), timer: 0, defuse: 0, plantT: 0, mesh: null, lightMesh: null, beepT: 0 };

const SPAWNS = [
  [-26, -26], [26, -26], [-26, 26], [26, 26],
  [0, -26], [-26, 0], [26, 0],
].map(([x, z]) => new THREE.Vector3(x, 0, z));

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const difficulty = () => Math.max(1, gameMode === 'bomb' ? round : wave);

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);
const hudEl = $('hud'), crossEl = $('crosshair'), hmEl = $('hitmarker');
const waveEl = $('wave'), enemiesLeftEl = $('enemies-left'), msgEl = $('message');
const hpBarEl = $('hp-bar'), hpNumEl = $('hp-num');
const ammoEl = $('ammo'), weaponNameEl = $('weapon-name'), killsEl = $('kills');
const dmgEl = $('damage-overlay');
const menuEl = $('menu'), playBtn = $('play-btn'), bombBtn = $('bomb-btn');
const deathEl = $('death-screen'), deathStatsEl = $('death-stats'), restartBtn = $('restart-btn');
const grenadesEl = $('grenades'), bombTimerEl = $('bomb-timer');
const plantWrapEl = $('plant-wrap'), plantBarEl = $('plant-bar');
const mmCanvas = $('minimap'), mmc = mmCanvas.getContext('2d');

/* ================= AUDIO (sintetizado) ================= */
let actx = null, masterGain = null, noiseBuf = null;

function initAudio() {
  if (actx) { actx.resume(); return; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = actx.createGain();
  masterGain.gain.value = 0.32;
  masterGain.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function playNoise(dur, { freq = 3000, gain = 1, type = 'lowpass', when = 0 } = {}) {
  if (!actx) return;
  const t = actx.currentTime + when;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  const g = actx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(masterGain);
  src.start(t); src.stop(t + dur);
}

function playTone(freq, dur, { type = 'square', gain = 0.2, slide = 0, when = 0 } = {}) {
  if (!actx) return;
  const t = actx.currentTime + when;
  const o = actx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur);
}

const sfxShot       = () => { playNoise(0.11, { freq: 4200, gain: 1.1 }); playTone(130, 0.09, { type: 'triangle', gain: 0.55, slide: 45 }); };
const sfxEnemyShot  = (dist) => { const v = 1 / (1 + dist * 0.09); playNoise(0.1, { freq: 1800, gain: 0.7 * v }); playTone(100, 0.08, { type: 'triangle', gain: 0.35 * v, slide: 50 }); };
const sfxHit        = () => playTone(950, 0.05, { gain: 0.3 });
const sfxHeadshot   = () => { playTone(1500, 0.05, { gain: 0.3 }); playTone(2000, 0.06, { gain: 0.25, when: 0.04 }); };
const sfxKill       = () => { playTone(700, 0.09, { gain: 0.28 }); playTone(1050, 0.12, { gain: 0.28, when: 0.07 }); };
const sfxEmpty      = () => playTone(2200, 0.03, { gain: 0.15 });
const sfxReload     = (t) => { playTone(500, 0.05, { gain: 0.25, when: 0.05 }); playTone(380, 0.05, { gain: 0.25, when: t * 0.55 }); playTone(650, 0.05, { gain: 0.3, when: t - 0.12 }); };
const sfxSwitch     = () => playTone(600, 0.05, { gain: 0.2 });
const sfxHurt       = () => { playNoise(0.16, { freq: 500, gain: 0.8 }); playTone(95, 0.18, { type: 'sawtooth', gain: 0.3, slide: 55 }); };
const sfxDeath      = () => playTone(320, 0.9, { type: 'sawtooth', gain: 0.4, slide: 50 });
const sfxWave       = () => { playTone(520, 0.12, { gain: 0.3 }); playTone(780, 0.16, { gain: 0.3, when: 0.14 }); };
const sfxWaveClear  = () => { playTone(660, 0.12, { gain: 0.3 }); playTone(880, 0.2, { gain: 0.3, when: 0.13 }); };
const sfxFootstep   = () => playNoise(0.05, { freq: 700, gain: 0.1 });
const sfxThrow      = () => playNoise(0.15, { freq: 1000, gain: 0.14 });
const sfxBounce     = () => playTone(750, 0.03, { gain: 0.1 });
const sfxBoom       = () => { playNoise(0.5, { freq: 320, gain: 1.5 }); playTone(65, 0.5, { type: 'sine', gain: 0.9, slide: 28 }); playNoise(0.22, { freq: 2600, gain: 0.45 }); };
const sfxPlanted    = () => { playTone(880, 0.1, { gain: 0.3 }); playTone(880, 0.1, { gain: 0.3, when: 0.16 }); playTone(1180, 0.18, { gain: 0.32, when: 0.32 }); };

/* ================= ESCENA ================= */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
scene.fog = new THREE.Fog(0xa8c0d0, 45, 140);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.85));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
sun.position.set(35, 55, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
sun.shadow.bias = -0.0004;
scene.add(sun);

const boomLight = new THREE.PointLight(0xff8833, 0, 20, 2);
scene.add(boomLight);

/* ================= TEXTURAS PROCEDURALES ================= */
function makeTex(base, flecks, n = 900, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) {
    g.fillStyle = flecks[(Math.random() * flecks.length) | 0];
    g.globalAlpha = rand(0.1, 0.5);
    g.fillRect(Math.random() * size, Math.random() * size, rand(1, 4), rand(1, 4));
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const floorTex = makeTex('#b09a72', ['#9a8560', '#c4ad84', '#8a7450'], 1400);
floorTex.repeat.set(16, 16);
const wallTex = makeTex('#c2ad83', ['#b09a70', '#d0bd95', '#a08a62'], 800);
const crateTex = (() => {
  const t = makeTex('#8a6b3d', ['#77592f', '#9c7d4b', '#6a4e28'], 400);
  const c = t.image, g = c.getContext('2d');
  g.strokeStyle = '#5a4222'; g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 122);
  g.beginPath(); g.moveTo(3, 3); g.lineTo(125, 125); g.moveTo(125, 3); g.lineTo(3, 125); g.stroke();
  return t;
})();

const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 });
const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });

/* ================= MAPA ================= */
// x,z = centro · w,d = tamaño · h = alto · y = base (para apilar)
const PIECES = [
  // muros perimetrales
  { x: 0, z: -30.5, w: 63, h: 5, d: 1, mat: 'wall' },
  { x: 0, z: 30.5, w: 63, h: 5, d: 1, mat: 'wall' },
  { x: -30.5, z: 0, w: 1, h: 5, d: 63, mat: 'wall' },
  { x: 30.5, z: 0, w: 1, h: 5, d: 63, mat: 'wall' },
  // "puertas del medio": dos muros con hueco central
  { x: -12.5, z: 0, w: 15, h: 3.4, d: 1.2, mat: 'wall' },
  { x: 12.5, z: 0, w: 15, h: 3.4, d: 1.2, mat: 'wall' },
  // punto A (noreste)
  { x: 16, z: -16, w: 2, h: 2, d: 2, mat: 'crate' },
  { x: 16, z: -16, w: 1.2, h: 1.2, d: 1.2, y: 2, mat: 'crate' },
  { x: 18.5, z: -17.5, w: 1.4, h: 1.4, d: 1.4, mat: 'crate' },
  { x: 17, z: -20, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  { x: 22, z: -14, w: 1, h: 1.2, d: 6, mat: 'wall' },
  // punto B (suroeste)
  { x: -16, z: 16, w: 2, h: 2, d: 2, mat: 'crate' },
  { x: -16, z: 16, w: 1.2, h: 1.2, d: 1.2, y: 2, mat: 'crate' },
  { x: -18.5, z: 17.5, w: 1.4, h: 1.4, d: 1.4, mat: 'crate' },
  { x: -17, z: 20, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  { x: -22, z: 14, w: 1, h: 1.2, d: 6, mat: 'wall' },
  // cajas del medio
  { x: 0, z: -6, w: 1.6, h: 1.6, d: 1.6, mat: 'crate' },
  { x: 2, z: -6.8, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  { x: -3, z: 8, w: 1.6, h: 1.6, d: 1.6, mat: 'crate' },
  { x: 8, z: 6, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  { x: -8, z: -8, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  { x: 6, z: -14, w: 1.6, h: 1.6, d: 1.6, mat: 'crate' },
  { x: 6, z: -14, w: 1.1, h: 1.1, d: 1.1, y: 1.6, mat: 'crate' },
  { x: -6, z: 14, w: 1.6, h: 1.6, d: 1.6, mat: 'crate' },
  { x: 14, z: 8, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  { x: -14, z: -6, w: 1.2, h: 1.2, d: 1.2, mat: 'crate' },
  // pilares
  { x: 10, z: -10, w: 1.5, h: 4, d: 1.5, mat: 'wall' },
  { x: -10, z: 10, w: 1.5, h: 4, d: 1.5, mat: 'wall' },
  { x: 10, z: 10, w: 1.5, h: 4, d: 1.5, mat: 'wall' },
  { x: -10, z: -10, w: 1.5, h: 4, d: 1.5, mat: 'wall' },
];

function buildMap() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2 + 4, ARENA_HALF * 2 + 4), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  worldMeshes.push(floor);

  const mats = { wall: wallMat, crate: crateMat };
  for (const p of PIECES) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mats[p.mat]);
    const y0 = p.y || 0;
    m.position.set(p.x, y0 + p.h / 2, p.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    worldMeshes.push(m);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(p.x - p.w / 2, y0, p.z - p.d / 2),
      new THREE.Vector3(p.x + p.w / 2, y0 + p.h, p.z + p.d / 2)
    ));
  }
}

// anillos y letras flotantes de los sites A/B
function buildSites() {
  for (const s of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd97a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);

    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = 'bold 90px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 12;
    g.strokeText(s.name, 64, 68);
    g.fillStyle = '#ffd97a';
    g.fillText(s.name, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }));
    spr.position.set(s.x, 3.6, s.z);
    spr.scale.setScalar(2.6);
    scene.add(spr);
  }
}

buildMap();
buildSites();

/* ================= FÍSICA AABB ================= */
function overlaps(e, b) {
  return e.pos.x + e.r > b.min.x && e.pos.x - e.r < b.max.x &&
         e.pos.z + e.r > b.min.z && e.pos.z - e.r < b.max.z &&
         e.pos.y + e.h > b.min.y && e.pos.y < b.max.y;
}

function resolveAxis(e, axis) {
  for (const b of colliders) {
    if (!overlaps(e, b)) continue;
    if (axis === 'x') {
      e.pos.x = e.vel.x > 0 ? b.min.x - e.r : b.max.x + e.r;
      e.vel.x = 0;
    } else if (axis === 'z') {
      e.pos.z = e.vel.z > 0 ? b.min.z - e.r : b.max.z + e.r;
      e.vel.z = 0;
    } else {
      if (e.vel.y <= 0) { e.pos.y = b.max.y; e.vel.y = 0; e.grounded = true; }
      else { e.pos.y = b.min.y - e.h; e.vel.y = 0; }
    }
  }
}

function moveEntity(e, dt) {
  e.pos.x += e.vel.x * dt; resolveAxis(e, 'x');
  e.pos.z += e.vel.z * dt; resolveAxis(e, 'z');
  e.pos.y += e.vel.y * dt;
  e.grounded = false;
  if (e.pos.y <= 0) { e.pos.y = 0; e.vel.y = 0; e.grounded = true; }
  resolveAxis(e, 'y');
  e.pos.x = clamp(e.pos.x, -ARENA_HALF + e.r, ARENA_HALF - e.r);
  e.pos.z = clamp(e.pos.z, -ARENA_HALF + e.r, ARENA_HALF - e.r);
}

/* ================= ARMAS (viewmodel) ================= */
const weaponRig = new THREE.Group();
camera.add(weaponRig);

const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.45, metalness: 0.7 });
const gunWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });

function buildFlash() {
  const g = new THREE.Group();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  const light = new THREE.PointLight(0xffcc66, 0, 7, 2);
  g.add(plane, light);
  g.userData = { plane, light };
  return g;
}

function buildRifle() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    g.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.07, 0.1, 0.5), gunMetal, 0, 0, 0);                    // cuerpo
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 8), gunMetal, 0, 0.01, -0.42, Math.PI / 2); // cañón
  add(new THREE.BoxGeometry(0.05, 0.16, 0.08), gunMetal, 0, -0.12, 0.03, 0.25);     // cargador
  add(new THREE.BoxGeometry(0.055, 0.08, 0.22), gunWood, 0, -0.01, 0.34);           // culata
  add(new THREE.BoxGeometry(0.05, 0.06, 0.16), gunWood, 0, -0.02, -0.22);           // guardamano
  add(new THREE.BoxGeometry(0.02, 0.035, 0.05), gunMetal, 0, 0.068, -0.1);          // mira
  const flash = buildFlash();
  flash.position.set(0, 0.01, -0.62);
  g.add(flash);
  g.userData.flash = flash;
  return g;
}

function buildPistol() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    g.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.045, 0.055, 0.24), gunMetal, 0, 0, 0);                // corredera
  add(new THREE.BoxGeometry(0.04, 0.13, 0.05), gunMetal, 0, -0.085, 0.075, 0.18);   // empuñadura
  add(new THREE.BoxGeometry(0.015, 0.025, 0.03), gunMetal, 0, 0.04, -0.09);         // mira
  const flash = buildFlash();
  flash.position.set(0, 0, -0.18);
  flash.scale.setScalar(0.6);
  g.add(flash);
  g.userData.flash = flash;
  return g;
}

const RIG_HIP = new THREE.Vector3(0.22, -0.2, -0.48);
const RIG_ADS = new THREE.Vector3(0, -0.145, -0.36);

const viewmodels = { rifle: buildRifle(), pistol: buildPistol() };
weaponRig.add(viewmodels.rifle, viewmodels.pistol);
viewmodels.pistol.visible = false;

function updateWeaponVisibility() {
  viewmodels.rifle.visible = player.weaponKey === 'rifle';
  viewmodels.pistol.visible = player.weaponKey === 'pistol';
}

/* ================= INPUT ================= */
const keys = {};

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (!started || paused || !player.alive) return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'Digit1') switchWeapon('rifle');
  if (e.code === 'Digit2') switchWeapon('pistol');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

addEventListener('mousedown', (e) => {
  if (!locked || !started || paused || !player.alive) return;
  if (e.button === 0) {
    player.firing = true;
    if (!WEAPONS[player.weaponKey].auto) tryFire();
  }
  if (e.button === 2) player.adsTarget = 1;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) player.firing = false;
  if (e.button === 2) player.adsTarget = 0;
});
addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('mousemove', (e) => {
  if (!locked || paused || !player.alive) return;
  const sens = 0.0023 * (1 - 0.45 * player.ads);
  player.yaw -= e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -1.45, 1.45);
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) {
    paused = false;
    menuEl.classList.add('hidden');
    deathEl.classList.add('hidden');
  } else if (started && player.alive) {
    paused = true;
    player.firing = false;
    player.adsTarget = 0;
    for (const k in keys) keys[k] = false;
    menuEl.querySelector('h1').textContent = 'PAUSA';
    playBtn.textContent = gameMode === 'survival' ? '▶ CONTINUAR' : '▶ SUPERVIVENCIA';
    bombBtn.textContent = gameMode === 'bomb' ? '▶ CONTINUAR' : '💣 MODO BOMBA';
    menuEl.classList.remove('hidden');
  }
});

function requestLock() {
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) { /* reintento al próximo clic */ }
}

function startGame(mode) {
  gameMode = mode;
  started = true;
  resetGame();
  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  requestLock();
}

playBtn.addEventListener('click', () => {
  initAudio();
  if (!started || gameMode !== 'survival') startGame('survival');
  else { menuEl.classList.add('hidden'); requestLock(); }
});

bombBtn.addEventListener('click', () => {
  initAudio();
  if (!started || gameMode !== 'bomb') startGame('bomb');
  else { menuEl.classList.add('hidden'); requestLock(); }
});

restartBtn.addEventListener('click', () => {
  initAudio();
  resetGame();
  deathEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  requestLock();
});

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================= PARTÍCULAS Y TRAZADORAS ================= */
const particleGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
const particleMats = {};
function particleMat(color) {
  if (!particleMats[color]) particleMats[color] = new THREE.MeshBasicMaterial({ color });
  return particleMats[color];
}

const particlePool = [];
function spawnParticles(pos, color, count, speed, life = 0.5) {
  for (let i = 0; i < count; i++) {
    let p = particlePool.find((q) => !q.active);
    if (!p) {
      if (particlePool.length > 120) return;
      p = { mesh: new THREE.Mesh(particleGeo, particleMat(color)), vel: new THREE.Vector3(), life: 0, maxLife: 1, active: false };
      p.mesh.visible = false;
      scene.add(p.mesh);
      particlePool.push(p);
    }
    p.mesh.material = particleMat(color);
    p.active = true; p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.vel.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.4, speed));
    p.life = p.maxLife = life * rand(0.6, 1.1);
    p.mesh.scale.setScalar(1);
  }
}

function updateParticles(dt) {
  for (const p of particlePool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
    p.vel.y -= 9 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.scale.setScalar(Math.max(0.1, p.life / p.maxLife));
  }
}

const tracerPool = [];
function spawnTracer(a, b, color = 0xffe08a) {
  let t = tracerPool.find((q) => !q.active);
  if (!t) {
    if (tracerPool.length > 24) return;
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    t = { line: new THREE.Line(new THREE.BufferGeometry(), mat), life: 0, active: false };
    t.line.visible = false;
    t.line.frustumCulled = false;
    scene.add(t.line);
    tracerPool.push(t);
  }
  t.line.material.color.setHex(color);
  t.line.geometry.setFromPoints([a, b]);
  t.life = 0.07;
  t.active = true;
  t.line.visible = true;
}

function updateTracers(dt) {
  for (const t of tracerPool) {
    if (!t.active) continue;
    t.life -= dt;
    if (t.life <= 0) { t.active = false; t.line.visible = false; }
    else t.line.material.opacity = t.life / 0.07;
  }
}

/* ================= GRANADAS ================= */
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2f4a2f, roughness: 0.55, metalness: 0.3 });

function throwGrenade() {
  if (!started || paused || !player.alive || grenadeCount <= 0) return;
  grenadeCount--;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const pos = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.5);
  pos.y -= 0.12;
  const vel = dir.clone().multiplyScalar(15);
  vel.y += 3.5;
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  mesh.position.copy(pos);
  scene.add(mesh);
  grenades.push({ pos, vel, mesh, fuse: 2.1 });
  sfxThrow();
  updateHUD();
}

function bounceAxis(g, axis) {
  const r = 0.09;
  for (const b of colliders) {
    if (g.pos.x + r <= b.min.x || g.pos.x - r >= b.max.x ||
        g.pos.z + r <= b.min.z || g.pos.z - r >= b.max.z ||
        g.pos.y + r <= b.min.y || g.pos.y - r >= b.max.y) continue;
    if (axis === 'x') { g.pos.x = g.vel.x > 0 ? b.min.x - r : b.max.x + r; g.vel.x *= -0.45; }
    else if (axis === 'z') { g.pos.z = g.vel.z > 0 ? b.min.z - r : b.max.z + r; g.vel.z *= -0.45; }
    else {
      if (g.vel.y <= 0) g.pos.y = b.max.y + r;
      else g.pos.y = b.min.y - r;
      if (Math.abs(g.vel.y) > 1.5) sfxBounce();
      g.vel.y = Math.abs(g.vel.y) > 1.2 ? -g.vel.y * 0.42 : 0;
      g.vel.x *= 0.75; g.vel.z *= 0.75;
    }
  }
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= GRAVITY * 0.75 * dt;
    g.pos.x += g.vel.x * dt; bounceAxis(g, 'x');
    g.pos.z += g.vel.z * dt; bounceAxis(g, 'z');
    g.pos.y += g.vel.y * dt;
    if (g.pos.y < 0.09) {
      g.pos.y = 0.09;
      if (g.vel.y < -1.5) sfxBounce();
      g.vel.y = Math.abs(g.vel.y) > 1.2 ? -g.vel.y * 0.42 : 0;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
    }
    bounceAxis(g, 'y');
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.x += dt * 7;
    g.mesh.rotation.z += dt * 5;
    if (g.fuse <= 0) {
      explode(g.pos, 6.5, 115, true);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

function explode(pos, radius, maxDmg, hurtPlayer = true) {
  spawnParticles(pos, 0xffaa33, 24, 9, 0.7);
  spawnParticles(pos, 0x774422, 14, 6, 0.9);
  spawnParticles(pos, 0x333333, 10, 4, 1.1);
  boomLight.position.set(pos.x, pos.y + 0.5, pos.z);
  boomLight.intensity = 80;
  boomTTL = 0.3;
  sfxBoom();
  shake = Math.max(shake, clamp(1 - pos.distanceTo(camera.position) / 20, 0, 1) * 0.6);
  const from = new THREE.Vector3(pos.x, pos.y + 0.2, pos.z);
  if (hurtPlayer && player.alive) {
    const chest = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const d = pos.distanceTo(chest);
    if (d < radius && hasLOS(from, chest)) damagePlayer(maxDmg * 0.6 * (1 - d / radius));
  }
  for (const e of enemies) {
    if (!e.alive) continue;
    const ec = new THREE.Vector3(e.pos.x, e.pos.y + 1, e.pos.z);
    const d = pos.distanceTo(ec);
    if (d < radius && hasLOS(from, ec)) {
      e.takeDamage(Math.round(maxDmg * (1 - d / radius)), false);
      spawnParticles(ec, 0xbb2222, 6, 3);
    }
  }
}

/* ================= ENEMIGOS ================= */
function buildEnemyMesh(enemy) {
  const g = new THREE.Group();
  const matUniform = new THREE.MeshStandardMaterial({ color: 0x55613f, roughness: 0.9 });
  const matPants = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.9 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xc9a189, roughness: 0.8 });
  const matVest = new THREE.MeshStandardMaterial({ color: 0x2e3328, roughness: 0.9 });
  const matGun = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.6 });
  const matBand = new THREE.MeshStandardMaterial({ color: 0xb02020, roughness: 0.8 });
  enemy.flashMats = [matUniform, matPants, matSkin, matVest];

  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // piernas con pivote en la cadera para animar el paso
  const legGeo = new THREE.BoxGeometry(0.16, 0.8, 0.18);
  legGeo.translate(0, -0.4, 0);
  enemy.legL = new THREE.Mesh(legGeo, matPants);
  enemy.legL.position.set(-0.11, 0.8, 0);
  enemy.legL.castShadow = true;
  enemy.legR = enemy.legL.clone();
  enemy.legR.position.x = 0.11;
  g.add(enemy.legL, enemy.legR);

  const torso = box(0.5, 0.62, 0.3, matUniform, 0, 1.11, 0);
  const vest = box(0.42, 0.4, 0.34, matVest, 0, 1.08, 0);
  const head = box(0.24, 0.26, 0.24, matSkin, 0, 1.58, 0);
  box(0.28, 0.12, 0.28, matPants, 0, 1.74, 0);                        // casco
  const armL = box(0.12, 0.44, 0.12, matUniform, -0.28, 1.22, 0.18);
  const armR = box(0.12, 0.44, 0.12, matUniform, 0.28, 1.22, 0.18);
  armL.rotation.x = armR.rotation.x = -1.15;
  box(0.14, 0.1, 0.14, matBand, 0.28, 1.32, 0.1);                      // brazalete rojo
  box(0.07, 0.12, 0.62, matGun, 0, 1.3, 0.38);                         // rifle

  enemy.hitMeshes = [torso, vest, enemy.legL, enemy.legR, armL, armR];
  for (const m of enemy.hitMeshes) m.userData = { enemy, part: 'body' };
  head.userData = { enemy, part: 'head' };
  enemy.hitMeshes.push(head);
  return g;
}

class Enemy {
  constructor(spawn) {
    this.pos = spawn.clone();
    this.vel = new THREE.Vector3();
    this.r = 0.35; this.h = 1.75; this.grounded = true;
    this.hp = 100 + (difficulty() - 1) * 8;
    this.speed = Math.min(2.2 + difficulty() * 0.12 + Math.random() * 0.8, 4.2);
    this.alive = true; this.deadT = 0;
    this.fireTimer = rand(1.2, 2.4);
    this.strafe = 0; this.strafeDir = 1;
    this.lastPos = this.pos.clone();
    this.stuckCheck = 0.5;
    this.walkT = 0; this.flashT = 0;
    this.mesh = buildEnemyMesh(this);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  takeDamage(dmg, isHead) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.flashT = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      kills++;
      sfxKill();
      updateHUD();
    }
  }

  update(dt) {
    if (!this.alive) {
      this.deadT += dt;
      const k = Math.min(this.deadT * 4, 1);
      this.mesh.rotation.x = -k * Math.PI / 2;
      if (this.deadT > 2.2) this.mesh.position.y -= dt * 0.8;
      return this.deadT > 3.2;
    }

    const pdx = player.pos.x - this.pos.x;
    const pdz = player.pos.z - this.pos.z;
    const pDist = Math.hypot(pdx, pdz) || 0.001;
    // con la bomba plantada, los bots corren a desactivarla
    const tgt = botObjective || player.pos;
    const dx = tgt.x - this.pos.x;
    const dz = tgt.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    let mvx = dx / dist, mvz = dz / dist;

    this.strafe -= dt;
    if (this.strafe > 0) {
      const px = -mvz * this.strafeDir, pz = mvx * this.strafeDir;
      mvx = px; mvz = pz;
    } else if (pDist < 12 && Math.random() < 0.006) {
      this.strafe = rand(0.6, 1.4);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }

    const sp = dist > (botObjective ? 1.3 : 2.2) ? this.speed : 0;
    this.vel.x = mvx * sp;
    this.vel.z = mvz * sp;
    this.vel.y -= GRAVITY * dt;
    moveEntity(this, dt);

    // detección de atasco: si no avanza, strafe lateral
    this.stuckCheck -= dt;
    if (this.stuckCheck <= 0) {
      if (sp > 0 && this.pos.distanceToSquared(this.lastPos) < 0.02) {
        this.strafe = rand(0.5, 1);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      this.lastPos.copy(this.pos);
      this.stuckCheck = 0.5;
    }

    this.mesh.rotation.y = pDist < 10 ? Math.atan2(pdx, pdz) : Math.atan2(dx, dz);
    this.walkT += dt * sp * 3.2;
    this.legL.rotation.x = Math.sin(this.walkT) * 0.55 * (sp > 0 ? 1 : 0);
    this.legR.rotation.x = -Math.sin(this.walkT) * 0.55 * (sp > 0 ? 1 : 0);

    this.fireTimer -= dt;
    if (player.alive && this.fireTimer <= 0 && pDist < 34) {
      const eye = this.pos.clone(); eye.y += 1.5;
      const target = player.pos.clone(); target.y += EYE_HEIGHT - 0.2;
      if (hasLOS(eye, target)) {
        this.shootAt(target, pDist);
        this.fireTimer = Math.max(0.6, 1.7 - difficulty() * 0.05) + Math.random() * 0.9;
      } else {
        this.fireTimer = 0.3;
      }
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.flashMats) m.emissive.setHex(on ? 0x881111 : 0x000000);
    }

    this.mesh.position.copy(this.pos);
    return false;
  }

  shootAt(target, dist) {
    const ry = this.mesh.rotation.y;
    const muzzle = this.pos.clone();
    muzzle.y += 1.32;
    muzzle.x += Math.sin(ry) * 0.55;
    muzzle.z += Math.cos(ry) * 0.55;
    const hitChance = clamp(0.5 - dist * 0.012 + difficulty() * 0.012, 0.1, 0.6);
    const hit = player.alive && Math.random() < hitChance;
    const aim = target.clone();
    if (!hit) { aim.x += rand(-1.4, 1.4); aim.y += rand(-0.8, 1.1); aim.z += rand(-1.4, 1.4); }
    spawnTracer(muzzle, aim, 0xff9944);
    sfxEnemyShot(dist);
    if (hit) damagePlayer(rand(5, 11) + difficulty() * 0.35);
  }
}

function hasLOS(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  dir.normalize();
  raycaster.set(from, dir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(worldMeshes, false);
  return hits.length === 0 || hits[0].distance > dist - 0.1;
}

function spawnEnemy() {
  const valid = SPAWNS.filter((s) => s.distanceTo(player.pos) > 12);
  const s = valid.length ? valid[(Math.random() * valid.length) | 0] : SPAWNS[0];
  enemies.push(new Enemy(s));
}

/* ================= DISPARO DEL JUGADOR ================= */
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function muzzleWorld() {
  const vm = viewmodels[player.weaponKey];
  vm.userData.flash.getWorldPosition(_muzzle);
  return _muzzle;
}

function tryFire() {
  const w = WEAPONS[player.weaponKey];
  const a = player.ammo[player.weaponKey];
  if (player.reloadTimer > 0 || player.switchTimer > 0 || player.fireTimer > 0) return;
  if (a.mag <= 0) { sfxEmpty(); startReload(); return; }

  a.mag--;
  player.fireTimer = 60 / w.rpm;

  const moving = (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) && player.grounded;
  const spread = w.spread * (1 + player.bloom * 2.2) * (moving ? 1.8 : 1) * (1 - 0.7 * player.ads);

  camera.getWorldDirection(_dir);
  _dir.x += rand(-spread, spread);
  _dir.y += rand(-spread, spread);
  _dir.z += rand(-spread, spread);
  _dir.normalize();

  camera.updateMatrixWorld(true);
  camera.getWorldPosition(_origin);
  raycaster.set(_origin, _dir);
  raycaster.far = 200;

  const targets = [...worldMeshes];
  for (const e of enemies) {
    if (!e.alive) continue;
    e.mesh.updateMatrixWorld(true);
    targets.push(...e.hitMeshes);
  }
  const hits = raycaster.intersectObjects(targets, false);

  const end = _origin.clone().addScaledVector(_dir, 120);
  if (hits.length) {
    const h = hits[0];
    end.copy(h.point);
    const ud = h.object.userData;
    if (ud.enemy) {
      const isHead = ud.part === 'head';
      let dmg = w.dmg * (isHead ? w.headMult : 1);
      if (h.distance > 22) dmg *= 0.8;
      ud.enemy.takeDamage(Math.round(dmg), isHead);
      spawnParticles(h.point, 0xbb2222, 8, 2.6);
      showHitmarker(isHead);
      if (isHead) sfxHeadshot(); else sfxHit();
    } else {
      spawnParticles(h.point, 0xffcc77, 6, 3.2);
    }
  }

  spawnTracer(muzzleWorld().clone(), end, w.tracer);
  player.recoil += w.kick * (1 - 0.35 * player.ads);
  player.recoilKick = Math.min(player.recoilKick + 0.05, 0.12);
  player.bloom = Math.min(1, player.bloom + 0.16);
  flashTTL = 0.05;
  sfxShot();
  updateHUD();
}

function startReload() {
  const w = WEAPONS[player.weaponKey];
  const a = player.ammo[player.weaponKey];
  if (player.reloadTimer > 0 || a.mag >= w.mag || a.reserve <= 0) return;
  player.reloadTimer = w.reloadTime;
  sfxReload(w.reloadTime);
}

function switchWeapon(key) {
  if (key === player.weaponKey || player.switchTimer > 0) return;
  player.weaponKey = key;
  player.reloadTimer = 0;
  player.switchTimer = 0.32;
  updateWeaponVisibility();
  sfxSwitch();
  updateHUD();
}

function damagePlayer(d) {
  if (!player.alive) return;
  player.hp -= Math.round(d);
  damageFlash = Math.min(damageFlash + 0.55, 1);
  sfxHurt();
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    player.firing = false;
    sfxDeath();
    document.exitPointerLock();
    deathStatsEl.textContent = gameMode === 'bomb'
      ? `Llegaste a la ronda ${round} · ${kills} bajas`
      : `Llegaste a la oleada ${wave} · ${kills} bajas`;
    hudEl.classList.add('hidden');
    deathEl.classList.remove('hidden');
  }
  updateHUD();
}

/* ================= MODO BOMBA ================= */
function buildBombMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x2a3325, roughness: 0.6, metalness: 0.3 })
  );
  body.castShadow = true;
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 })
  );
  led.position.set(0.1, 0.13, 0);
  g.add(body, led);
  bomb.lightMesh = led;
  return g;
}

function startRound(n) {
  round = n;
  for (const e of enemies) scene.remove(e.mesh);
  enemies.length = 0;
  player.pos.set(0, 0, 24);
  player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0;
  player.hp = Math.min(100, player.hp + 50);
  grenadeCount = Math.min(grenadeCount + 2, 3);
  for (const k in WEAPONS) player.ammo[k].reserve = WEAPONS[k].reserve;
  if (bomb.mesh) { scene.remove(bomb.mesh); bomb.mesh = null; }
  bomb.carried = true; bomb.planted = false;
  bomb.plantT = 0; bomb.timer = 0; bomb.defuse = 0;
  botObjective = null;
  spawnQueue = Math.min(4 + n, 10);
  spawnTimer = 2;
  trickleTimer = 9;
  roundEndT = 0;
  showMessage('RONDA ' + n + ' · PLANTA LA BOMBA');
  sfxWave();
  updateHUD();
}

function plantBomb() {
  bomb.carried = false; bomb.planted = true;
  bomb.timer = 40; bomb.defuse = 0; bomb.plantT = 0;
  bomb.pos.copy(player.pos);
  bomb.mesh = buildBombMesh();
  bomb.mesh.position.set(bomb.pos.x, 0.11, bomb.pos.z);
  scene.add(bomb.mesh);
  botObjective = bomb.pos;
  spawnQueue += Math.min(3 + round, 8);
  spawnTimer = 2;
  trickleTimer = 5;
  showMessage('¡BOMBA PLANTADA! DEFIENDE 40s');
  sfxPlanted();
  updateHUD();
}

function bombExplodes() {
  const p = bomb.pos.clone();
  if (bomb.mesh) { scene.remove(bomb.mesh); bomb.mesh = null; }
  bomb.planted = false;
  botObjective = null;
  explode(p, 15, 400, false);
  showMessage('¡OBJETIVO DESTRUIDO!');
  sfxWaveClear();
  round++;
  roundEndT = 3.5;
  updateHUD();
}

function bombDefused() {
  if (bomb.mesh) { scene.remove(bomb.mesh); bomb.mesh = null; }
  bomb.planted = false;
  botObjective = null;
  showMessage('BOMBA DESACTIVADA · RONDA PERDIDA');
  sfxDeath();
  roundEndT = 3.5; // round no cambia: se repite la misma ronda
}

function updateBombMode(dt) {
  if (roundEndT > 0) {
    roundEndT -= dt;
    if (roundEndT <= 0) startRound(round);
    return;
  }

  const vivos = enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  if (spawnQueue > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnEnemy(); spawnQueue--; spawnTimer = 1.4; updateHUD(); }
  } else {
    trickleTimer -= dt;
    if (trickleTimer <= 0 && vivos < 4 + round) {
      spawnEnemy();
      trickleTimer = Math.max(2.5, 7 - round * 0.4);
      updateHUD();
    }
  }

  // plantado: mantener E dentro de un site
  if (bomb.carried && player.alive) {
    const site = SITES.find((s) => Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < s.r);
    plantWrapEl.classList.toggle('hidden', !site);
    if (site) {
      if (keys.KeyE) bomb.plantT += dt;
      else bomb.plantT = Math.max(0, bomb.plantT - dt * 2.5);
      plantBarEl.style.width = Math.min(100, (bomb.plantT / 3.2) * 100) + '%';
      if (bomb.plantT >= 3.2) plantBomb();
    } else {
      bomb.plantT = 0;
      plantBarEl.style.width = '0%';
    }
  } else {
    plantWrapEl.classList.add('hidden');
  }

  // cuenta atrás y desactivación
  if (bomb.planted) {
    bomb.timer -= dt;
    bomb.beepT -= dt;
    if (bomb.beepT <= 0) {
      playTone(1250, 0.05, { gain: 0.18 });
      bomb.beepT = clamp(bomb.timer / 40, 0.12, 1) * 0.9 + 0.08;
    }
    if (bomb.lightMesh) bomb.lightMesh.visible = performance.now() % 500 < 250;

    let defusing = false;
    for (const e of enemies) {
      if (e.alive && e.pos.distanceTo(bomb.pos) < 2.4) { defusing = true; break; }
    }
    if (defusing) bomb.defuse += dt;
    else bomb.defuse = Math.max(0, bomb.defuse - dt * 1.5);

    bombTimerEl.textContent = '0:' + String(Math.max(0, Math.ceil(bomb.timer))).padStart(2, '0');
    bombTimerEl.classList.toggle('defusing', bomb.defuse > 0.5);

    if (bomb.defuse >= 5) { bombDefused(); return; }
    if (bomb.timer <= 0) bombExplodes();
  }
}

/* ================= OLEADAS (supervivencia) ================= */
function startWave(n) {
  wave = n;
  spawnQueue = Math.min(3 + n * 2, 14);
  spawnTimer = 1;
  intermission = -1;
  showMessage('OLEADA ' + n);
  sfxWave();
  updateHUD();
}

function updateWaves(dt) {
  if (spawnQueue > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEnemy();
      spawnQueue--;
      spawnTimer = 1.1;
      updateHUD();
    }
  } else if (enemies.length === 0 && player.alive) {
    if (intermission < 0) {
      intermission = 0;
      showMessage('OLEADA SUPERADA · +30 PV');
      sfxWaveClear();
    }
    intermission += dt;
    if (intermission >= 3) {
      player.hp = Math.min(100, player.hp + 30);
      grenadeCount = 3;
      for (const k in WEAPONS) player.ammo[k].reserve = WEAPONS[k].reserve;
      startWave(wave + 1);
    }
  }
}

/* ================= HUD Y MINIMAPA ================= */
function updateHUD() {
  hpBarEl.style.width = player.hp + '%';
  hpBarEl.style.background = player.hp > 50
    ? 'linear-gradient(90deg,#4dd06a,#8ce05a)'
    : player.hp > 25 ? 'linear-gradient(90deg,#e0b34d,#e0cf5a)' : 'linear-gradient(90deg,#e05a4d,#e08a5a)';
  hpNumEl.textContent = Math.ceil(player.hp);
  const w = WEAPONS[player.weaponKey];
  const a = player.ammo[player.weaponKey];
  ammoEl.innerHTML = `${a.mag} <span>/ ${a.reserve}</span>`;
  weaponNameEl.textContent = w.name;
  waveEl.textContent = gameMode === 'bomb' ? 'RONDA ' + Math.max(round, 1) : 'OLEADA ' + Math.max(wave, 1);
  killsEl.textContent = 'BAJAS ' + kills;
  grenadesEl.textContent = 'GRANADAS ' + grenadeCount;
  const alive = enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  enemiesLeftEl.textContent = (alive + spawnQueue) > 0 ? `ENEMIGOS ${alive + spawnQueue}` : '';
  if (gameMode === 'bomb') {
    bombTimerEl.classList.remove('hidden');
    if (!bomb.planted) {
      bombTimerEl.classList.remove('defusing');
      bombTimerEl.textContent = bomb.carried ? '💣 BOMBA EN TU PODER' : '';
    }
  } else {
    bombTimerEl.classList.add('hidden');
    plantWrapEl.classList.add('hidden');
  }
}

function showHitmarker(isHead) {
  hmEl.classList.remove('show', 'head');
  void hmEl.offsetWidth;
  if (isHead) hmEl.classList.add('head');
  hmEl.classList.add('show');
}

function showMessage(text, dur = 2.2) {
  msgEl.textContent = text;
  msgEl.style.opacity = 1;
  messageTimer = dur;
}

function updateHUDFrame(dt) {
  const moving = (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD) && player.grounded;
  const gap = 6 + player.bloom * 24 + (moving ? 5 : 0) - player.ads * 3;
  crossEl.style.setProperty('--gap', Math.max(2, gap) + 'px');
  crossEl.style.opacity = 1 - player.ads * 0.7;

  damageFlash = Math.max(0, damageFlash - dt * 1.8);
  const lowHp = player.alive && player.hp < 30 ? 0.22 + 0.1 * Math.sin(performance.now() * 0.008) : 0;
  dmgEl.style.opacity = Math.max(damageFlash, lowHp);

  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) msgEl.style.opacity = 0;
  }
}

function drawMinimap() {
  const S = mmCanvas.width;
  const scale = S / (ARENA_HALF * 2 + 4);
  const px = (x) => (x + ARENA_HALF + 2) * scale;
  const pz = (z) => (z + ARENA_HALF + 2) * scale;

  mmc.fillStyle = 'rgba(8,12,8,0.72)';
  mmc.fillRect(0, 0, S, S);

  for (const p of PIECES) {
    mmc.fillStyle = p.mat === 'wall' ? 'rgba(185,175,145,0.85)' : 'rgba(150,118,72,0.85)';
    mmc.fillRect(px(p.x - p.w / 2), pz(p.z - p.d / 2), p.w * scale, p.d * scale);
  }

  mmc.textAlign = 'center';
  mmc.textBaseline = 'middle';
  for (const s of SITES) {
    mmc.strokeStyle = 'rgba(255,217,122,0.55)';
    mmc.lineWidth = 1.5;
    mmc.beginPath();
    mmc.arc(px(s.x), pz(s.z), s.r * scale, 0, Math.PI * 2);
    mmc.stroke();
    mmc.fillStyle = '#ffd97a';
    mmc.font = 'bold 11px monospace';
    mmc.fillText(s.name, px(s.x), pz(s.z));
  }

  if (bomb.planted) {
    mmc.fillStyle = performance.now() % 500 < 250 ? '#ffd54a' : '#ff8833';
    mmc.beginPath();
    mmc.arc(px(bomb.pos.x), pz(bomb.pos.z), 4, 0, Math.PI * 2);
    mmc.fill();
  }

  mmc.fillStyle = '#ff5252';
  for (const e of enemies) {
    if (!e.alive) continue;
    mmc.beginPath();
    mmc.arc(px(e.pos.x), pz(e.pos.z), 2.5, 0, Math.PI * 2);
    mmc.fill();
  }

  // jugador: triángulo verde orientado según yaw
  mmc.save();
  mmc.translate(px(player.pos.x), pz(player.pos.z));
  mmc.rotate(-player.yaw);
  mmc.fillStyle = '#5aff8a';
  mmc.beginPath();
  mmc.moveTo(0, -5.5);
  mmc.lineTo(3.8, 4.2);
  mmc.lineTo(-3.8, 4.2);
  mmc.closePath();
  mmc.fill();
  mmc.restore();
}

/* ================= JUGADOR ================= */
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function updatePlayer(dt) {
  const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);

  _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  const sprint = keys.ShiftLeft && iz > 0 && player.ads < 0.3;
  let speed = sprint ? 7.4 : 4.9;
  speed *= 1 - 0.45 * player.ads;

  const mx = _right.x * ix + _fwd.x * iz;
  const mz = _right.z * ix + _fwd.z * iz;
  const len = Math.hypot(mx, mz) || 1;
  const moving = (ix !== 0 || iz !== 0);
  player.vel.x = moving ? (mx / len) * speed : 0;
  player.vel.z = moving ? (mz / len) * speed : 0;

  if (keys.Space && player.grounded) player.vel.y = 8.2;
  player.vel.y -= GRAVITY * dt;
  moveEntity(player, dt);

  // pasos
  if (moving && player.grounded) {
    player.walkT += dt * speed * 1.6;
    player.stepT -= dt;
    if (player.stepT <= 0) { sfxFootstep(); player.stepT = sprint ? 0.3 : 0.4; }
  }

  // temporizadores de combate
  player.fireTimer -= dt;
  player.bloom = Math.max(0, player.bloom - dt * 1.5);
  player.recoil *= Math.exp(-9 * dt);
  player.recoilKick *= Math.exp(-10 * dt);
  player.ads += (player.adsTarget - player.ads) * Math.min(1, dt * 12);

  const w = WEAPONS[player.weaponKey];
  const a = player.ammo[player.weaponKey];
  if (player.reloadTimer > 0) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      const take = Math.min(w.mag - a.mag, a.reserve);
      a.mag += take;
      a.reserve -= take;
      updateHUD();
    }
  }
  if (player.switchTimer > 0) player.switchTimer -= dt;

  if (player.firing && w.auto) tryFire();

  // cámara
  const bobY = moving && player.grounded ? Math.sin(player.walkT * 2) * 0.022 : 0;
  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + bobY, player.pos.z);
  if (shake > 0.002) {
    camera.position.x += rand(-1, 1) * shake * 0.14;
    camera.position.y += rand(-1, 1) * shake * 0.1;
    camera.position.z += rand(-1, 1) * shake * 0.14;
  }
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + player.recoil;

  const targetFov = 75 - 23 * player.ads;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }

  // viewmodel
  const rig = weaponRig;
  rig.position.lerpVectors(RIG_HIP, RIG_ADS, player.ads);
  rig.position.y += moving && player.grounded ? Math.sin(player.walkT * 2) * 0.012 - 0.006 : 0;
  rig.position.x += moving && player.grounded ? Math.sin(player.walkT) * 0.008 : 0;
  rig.position.z += player.recoilKick;
  let dip = 0;
  if (player.reloadTimer > 0) {
    const p = 1 - player.reloadTimer / w.reloadTime;
    dip = Math.sin(Math.min(p * 1.25, 1) * Math.PI);
  }
  if (player.switchTimer > 0) dip = Math.max(dip, Math.sin((player.switchTimer / 0.32) * Math.PI));
  rig.rotation.x = -dip * 0.9;
  rig.position.y -= dip * 0.12;
}

function updateEnemies(dt) {
  // separación entre bots
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.64 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (0.8 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].update(dt)) {
      scene.remove(enemies[i].mesh);
      enemies.splice(i, 1);
    }
  }
}

function updateFlash(dt) {
  for (const key in viewmodels) {
    const f = viewmodels[key].userData.flash;
    if (key === player.weaponKey && flashTTL > 0) {
      f.userData.light.intensity = 7 * (flashTTL / 0.05);
      f.userData.plane.visible = true;
      f.userData.plane.rotation.z = Math.random() * Math.PI;
      f.userData.plane.scale.setScalar(rand(0.8, 1.4));
    } else {
      f.userData.light.intensity = 0;
      f.userData.plane.visible = false;
    }
  }
  if (flashTTL > 0) flashTTL -= dt;
}

/* ================= FLUJO DE JUEGO ================= */
function resetGame() {
  for (const e of enemies) scene.remove(e.mesh);
  enemies.length = 0;
  for (const g of grenades) scene.remove(g.mesh);
  grenades.length = 0;
  if (bomb.mesh) { scene.remove(bomb.mesh); bomb.mesh = null; }
  bomb.carried = false; bomb.planted = false;
  bomb.plantT = 0; bomb.timer = 0; bomb.defuse = 0;
  botObjective = null;
  roundEndT = 0;
  player.pos.set(0, 0, 24);
  player.vel.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0;
  player.hp = 100; player.alive = true;
  player.ammo = { rifle: { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve }, pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  player.weaponKey = 'rifle';
  updateWeaponVisibility();
  player.firing = false;
  player.fireTimer = 0; player.reloadTimer = 0; player.switchTimer = 0;
  player.bloom = 0; player.ads = 0; player.adsTarget = 0;
  player.recoil = 0; player.recoilKick = 0;
  grenadeCount = 2;
  kills = 0;
  damageFlash = 0;
  shake = 0;
  if (gameMode === 'bomb') startRound(1);
  else startWave(1);
}

/* ================= BUCLE PRINCIPAL ================= */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (started && !paused && player.alive) {
    updatePlayer(dt);
    updateEnemies(dt);
    if (gameMode === 'bomb') updateBombMode(dt);
    else updateWaves(dt);
  } else if (started && !player.alive) {
    updateEnemies(dt); // los cadáveres terminan su animación
  }
  if (started && !paused) updateGrenades(dt);

  updateParticles(dt);
  updateTracers(dt);
  updateFlash(dt);
  if (boomTTL > 0) {
    boomTTL -= dt;
    boomLight.intensity *= Math.exp(-12 * dt);
    if (boomTTL <= 0) boomLight.intensity = 0;
  }
  shake *= Math.exp(-5 * dt);
  updateHUDFrame(dt);
  if (started) drawMinimap();
  renderer.render(scene, camera);
}
animate();
