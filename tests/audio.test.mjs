import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../audio.js';

// These tests validate graph routing/lifecycle. They do not replace listening
// in a browser or assert subjective sound quality.
class Parameter {
  constructor(value = 0) { this.value = value; this.target = value; this.events = []; }
  cancelScheduledValues() {}
  setTargetAtTime(value, time) { this.check(value, time); this.target = value; }
  setValueAtTime(value, time) { this.check(value, time); this.value = value; }
  linearRampToValueAtTime(value, time) { this.check(value, time); }
  exponentialRampToValueAtTime(value, time) { this.check(value, time); assert.ok(value > 0); }
  check(value, time) {
    assert.ok(Number.isFinite(value) && Number.isFinite(time));
    this.events.push({ value, time });
  }
}

class AudioNode {
  constructor(context, type) {
    this.context = context;
    this.type = type;
    this.kind = type;
    this.connections = [];
    this.gain = new Parameter(1);
    this.frequency = new Parameter();
    this.Q = new Parameter();
    this.pan = new Parameter();
    context.nodes.push(this);
  }
  connect(node) { this.connections.push(node); }
  disconnect() { this.connections.length = 0; this.disconnected = true; }
  start(time = 0) { assert.ok(time >= 0); this.startAt = time; this.context.sources.push(this); }
  stop(time) { assert.ok(time >= 0); this.stopAt = time; }
}

class MockContext {
  constructor() {
    MockContext.latest = this;
    this.nodes = []; this.sources = [];
    this.currentTime = 0; this.sampleRate = 48000; this.state = 'suspended';
    this.destination = new AudioNode(this, 'destination');
  }
  async resume() { this.state = 'running'; }
  createGain() { return new AudioNode(this, 'gain'); }
  createConvolver() { return new AudioNode(this, 'convolver'); }
  createBufferSource() { return new AudioNode(this, 'buffer-source'); }
  createBiquadFilter() { return new AudioNode(this, 'filter'); }
  createOscillator() { return new AudioNode(this, 'oscillator'); }
  createStereoPanner() { return new AudioNode(this, 'panner'); }
  createDynamicsCompressor() {
    const node = new AudioNode(this, 'compressor');
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Parameter();
    return node;
  }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / rate, getChannelData: index => data[index] };
  }
}

async function withAudio(run) {
  const previous = globalThis.AudioContext;
  try {
    globalThis.AudioContext = MockContext;
    const audio = createAudio();
    assert.equal(await audio.init(), true);
    await run(audio, MockContext.latest);
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
}

function envelopeOf(source) {
  const first = source.connections[0];
  return first.kind === 'filter' ? first.connections[0] : first;
}

function peakGain(source) {
  return Math.max(...envelopeOf(source).gain.events.map(event => event.value));
}

function reaches(source, target, visited = new Set()) {
  if (source === target) return true;
  if (visited.has(source)) return false;
  visited.add(source);
  return source.connections.some(next => reaches(next, target, visited));
}

test('audio unsupported or blocked does not prevent gameplay', async () => {
  const previous = globalThis.AudioContext;
  try {
    globalThis.AudioContext = class { constructor() { throw new Error('Audio blocked'); } };
    const audio = createAudio();
    audio.shot(); audio.setVolume(0.5); audio.setPaused(false);
    assert.equal(await audio.init(), false);
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('death cue plays after pause while wind and gameplay remain paused', async () => withAudio((audio, context) => {
  audio.setPaused(false);
  audio.shot();
  audio.setPaused(true);
  const before = context.sources.length;
  audio.shot(); audio.footstep(); audio.beep();
  audio.enemyFootstep(); audio.incoming(); audio.heartbeat(); audio.alert();
  assert.equal(context.sources.length, before, 'gameplay sounds must remain blocked');
  audio.death();
  assert.equal(context.sources.length, before + 2, 'death still produces its two voices');
  const deathTone = context.sources[before];
  const envelope = deathTone.connections[0];
  const notificationBus = envelope.connections[0];
  assert.equal(notificationBus.gain.target, 1, 'notification bus must bypass paused effects gate');
  assert.equal(notificationBus.connections[0].type, 'compressor');
  assert.ok(context.nodes.filter(node => node.type === 'gain' && node.gain.target === 0).length >= 2,
    'effects and ambience remain muted');
}));

test('all cues route safely, stereo works, mute persists, and voices disconnect', async () => withAudio((audio, context) => {
  audio.setPaused(false);
  for (const method of ['shot', 'enemyShot', 'hit', 'kill', 'empty', 'reload', 'switch', 'hurt',
    'death', 'wave', 'footstep', 'enemyFootstep', 'incoming', 'heartbeat', 'alert',
    'throw', 'bounce', 'boom', 'planted', 'beep']) audio[method]();
  audio.shot('pistol'); audio.hit(true); audio.wave(true); audio.footstep(true);
  audio.enemyShot(20, -0.75);
  assert.ok(context.nodes.some(node => node.type === 'panner' && node.pan.value === -0.75));
  const master = context.nodes.find(node => node.connections.includes(context.destination));
  audio.setMuted(true); audio.setVolume(0.4);
  assert.equal(master.gain.target, 0, 'volume changes must preserve mute');
  audio.setMuted(false);
  assert.equal(master.gain.target, 0.4 * 0.55);
  audio.setVolume(NaN);
  assert.equal(master.gain.target, 0.4 * 0.55, 'invalid input must not poison gain');
  audio.setPaused(true);
  let cleaned = 0;
  for (const source of context.sources) {
    if (!source.onended) continue;
    assert.ok(source.stopAt !== undefined);
    source.onended();
    assert.equal(source.disconnected, true);
    assert.equal(source.onended, null);
    cleaned++;
  }
  assert.ok(cleaned > 30, 'every transient source is eligible for cleanup');
}));

test('enemy footsteps fall off with distance, become muffled behind cover, and stop at hearing range',
  async () => withAudio((audio, context) => {
    audio.setPaused(false);
    function step(distance, occluded = false) {
      const before = context.sources.length;
      audio.enemyFootstep(distance, 0, occluded);
      return context.sources.slice(before);
    }
    const near = step(2);
    const far = step(14);
    const covered = step(2, true);
    assert.equal(near.length, 2, 'a footfall has ground texture and a low impact');
    assert.equal(far.length, 2);
    assert.equal(covered.length, 2);
    for (let index = 0; index < near.length; index++) {
      assert.ok(peakGain(near[index]) > peakGain(far[index]) * 4,
        'approaching footsteps must become substantially clearer');
      assert.ok(peakGain(covered[index]) < peakGain(near[index]) * 0.5,
        'cover attenuates both layers');
    }
    assert.ok(covered[0].connections[0].frequency.value < near[0].connections[0].frequency.value / 2,
      'cover also removes high-frequency texture');
    for (const distance of [18, 30, Infinity, NaN]) {
      assert.equal(step(distance).length, 0, 'inaudible or invalid positions allocate no voices');
    }
    assert.equal(step(-2).length, 2, 'negative distance is safely treated as point-blank');
  }));

test('enemy footfalls and incoming shots preserve direction and clamp out-of-range panning',
  async () => withAudio((audio, context) => {
    audio.setPaused(false);
    for (const method of ['enemyFootstep', 'incoming']) {
      for (const [requested, expected] of [[-0.8, -0.8], [0.7, 0.7], [-4, -1], [4, 1]]) {
        const before = context.sources.length;
        if (method === 'enemyFootstep') audio[method](4, requested);
        else audio[method](requested);
        const voices = context.sources.slice(before);
        assert.equal(voices.length, 2);
        for (const voice of voices) {
          const panner = envelopeOf(voice).connections[0];
          assert.equal(panner.kind, 'panner');
          assert.equal(panner.pan.value, expected);
        }
      }
      if (method === 'enemyFootstep') audio[method](4, NaN);
      else audio[method](NaN);
      assert.equal(envelopeOf(context.sources.at(-1)).connections[0].kind, 'gain',
        'invalid direction safely falls back to center');
    }
  }));

test('combat alerts use the muted master, freeze during pause, and cancel scheduled second pulses',
  async () => withAudio((audio, context) => {
    const cues = ['enemyFootstep', 'incoming', 'heartbeat', 'alert'];
    const master = context.nodes.find(node => node.connections.includes(context.destination));
    audio.setMuted(true);
    audio.setPaused(false);
    const before = context.sources.length;
    cues.forEach(method => audio[method]());
    const combatVoices = context.sources.slice(before);
    assert.equal(combatVoices.length, 8);
    assert.equal(master.gain.target, 0);
    combatVoices.forEach(voice => assert.ok(reaches(voice, master),
      'each alert must pass through the master mute'));
    assert.ok(combatVoices[5].startAt > combatVoices[4].startAt + 0.15,
      'the heartbeat is a spaced double pulse');
    assert.ok(combatVoices[7].startAt > combatVoices[6].startAt,
      'the alert is two short tones');
    audio.setPaused(true);
    combatVoices.forEach(voice => assert.ok(voice.stopAt <= context.currentTime + 0.04,
      'pausing cancels active cues and future pulses'));
    const pausedCount = context.sources.length;
    cues.forEach(method => audio[method]());
    assert.equal(context.sources.length, pausedCount);
    audio.setVolume(0.6);
    assert.equal(master.gain.target, 0, 'adjusting volume while muted does not restore alerts');
    audio.setMuted(false);
    assert.equal(master.gain.target, 0.6 * 0.55);
    cues.forEach(method => audio[method]());
    assert.equal(context.sources.length, pausedCount, 'unmuting must not resume paused cues');
    audio.setPaused(false);
    audio.heartbeat();
    assert.equal(context.sources.length, pausedCount + 2, 'resuming allows a fresh pulse');
  }));
