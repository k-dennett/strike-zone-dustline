// Procedural audio: no recordings, network assets or worklets are required.
// Call init() from a user gesture and setPaused(false) when gameplay starts.
export function createAudio() {
  let context = null;
  let master = null;
  let effects = null;
  let notifications = null;
  let ambienceGate = null;
  let reverb = null;
  let noiseBuffer = null;
  let volume = 0.7;
  let muted = false;
  let paused = true;
  const voices = new Set();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  function smooth(param, value, seconds = 0.035) {
    if (!context) return;
    param.cancelScheduledValues(context.currentTime);
    param.setTargetAtTime(value, context.currentTime, seconds);
  }

  function cleanup(source, nodes) {
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      for (const node of [source, ...nodes]) node.disconnect();
      source.onended = null;
    };
  }

  function connectVoice(source, envelope, { filter = null, pan = 0, wet = 0.09, notification = false } = {}) {
    const nodes = [envelope];
    if (filter) {
      source.connect(filter);
      filter.connect(envelope);
      nodes.push(filter);
    } else source.connect(envelope);

    let output = envelope;
    if (context.createStereoPanner && pan !== 0) {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      envelope.connect(panner);
      output = panner;
      nodes.push(panner);
    }
    output.connect(notification ? notifications : effects);
    if (wet > 0) {
      const send = context.createGain();
      send.gain.value = wet;
      output.connect(send);
      send.connect(reverb);
      nodes.push(send);
    }
    cleanup(source, nodes);
  }

  function tone(frequency, duration, {
    gain = 0.15, type = 'sine', end = frequency, when = 0, pan = 0, wet = 0.08, notification = false,
  } = {}) {
    if (!context || (paused && !notification) || context.state === 'closed') return;
    const start = context.currentTime + when;
    const source = context.createOscillator();
    const envelope = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(Math.max(25, frequency), start);
    source.frequency.exponentialRampToValueAtTime(Math.max(25, end), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.004, duration / 5));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    connectVoice(source, envelope, { pan, wet, notification });
    source.start(start);
    source.stop(start + duration + 0.015);
  }

  function noise(duration, {
    frequency = 2400, gain = 0.3, type = 'lowpass', when = 0, pan = 0, wet = 0.13, notification = false,
  } = {}) {
    if (!context || (paused && !notification) || context.state === 'closed') return;
    const start = context.currentTime + when;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    connectVoice(source, envelope, { filter, pan, wet, notification });
    source.start(start, random(0, Math.max(0, noiseBuffer.duration - duration - 0.05)));
    source.stop(start + duration + 0.015);
  }

  function makeAmbience(bus) {
    const wind = context.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 440;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 90;
    const windLevel = context.createGain();
    windLevel.gain.value = 0.033;
    ambienceGate = context.createGain();
    ambienceGate.gain.value = paused ? 0 : 1;
    wind.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(windLevel);
    windLevel.connect(ambienceGate);
    ambienceGate.connect(bus);

    const gust = context.createOscillator();
    gust.type = 'sine';
    gust.frequency.value = 0.085;
    const gustDepth = context.createGain();
    gustDepth.gain.value = 0.012;
    gust.connect(gustDepth);
    gustDepth.connect(windLevel.gain);
    wind.start();
    gust.start();
  }

  function configure() {
    const bus = context.createDynamicsCompressor();
    bus.threshold.value = -15;
    bus.knee.value = 20;
    bus.ratio.value = 6;
    bus.attack.value = 0.003;
    bus.release.value = 0.2;
    master = context.createGain();
    master.gain.value = muted ? 0 : volume * 0.55;
    bus.connect(master);
    master.connect(context.destination);
    effects = context.createGain();
    effects.gain.value = paused ? 0 : 1;
    effects.connect(bus);
    // End-of-round/death cues can follow setPaused(true) without restarting wind
    // or allowing gameplay voices. The master still controls volume and mute.
    notifications = context.createGain();
    notifications.connect(bus);

    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = random(-1, 1);

    // A short, quiet stereo impulse gives shots a sense of an outdoor courtyard.
    // It remains local and is synthesized once, when the audio context opens.
    reverb = context.createConvolver();
    const length = Math.floor(context.sampleRate * 0.2);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const attack = Math.min(1, i / (context.sampleRate * 0.012));
        data[i] = random(-1, 1) * Math.pow(1 - i / length, 3) * attack;
      }
    }
    reverb.buffer = impulse;
    reverb.connect(effects);
    makeAmbience(bus);
  }

  async function init() {
    try {
      if (!context) {
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) return false;
        context = new AudioContextClass({ latencyHint: 'interactive' });
        configure();
      }
      if (context.state === 'suspended') await context.resume();
      return context.state === 'running';
    } catch {
      // Audio is optional: unsupported/blocked output must never prevent play.
      return false;
    }
  }

  return {
    init,
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = clamp(value, 0, 1);
      if (master) smooth(master.gain, muted ? 0 : volume * 0.55);
    },
    setMuted(value) {
      muted = Boolean(value);
      if (master) smooth(master.gain, muted ? 0 : volume * 0.55);
    },
    setPaused(value) {
      paused = Boolean(value);
      if (!context) return;
      smooth(effects.gain, paused ? 0 : 1, 0.012);
      smooth(ambienceGate.gain, paused ? 0 : 1, paused ? 0.04 : 0.35);
      if (paused) {
        for (const voice of voices) {
          try { voice.stop(context.currentTime + 0.04); } catch { /* already ended */ }
        }
      }
    },
    shot(weaponKey = 'rifle') {
      if (weaponKey === 'pistol') {
        noise(0.085, { frequency: 5900, gain: 0.72, wet: 0.17 });
        tone(185, 0.11, { type: 'triangle', gain: 0.45, end: 55 });
        noise(0.028, { frequency: 2800, gain: 0.12, when: 0.055, type: 'bandpass', wet: 0.04 });
      } else {
        noise(0.125, { frequency: 4100, gain: 0.86, wet: 0.2 });
        tone(130, 0.125, { type: 'triangle', gain: 0.5, end: 42 });
        noise(0.04, { frequency: 850, gain: 0.3, wet: 0.1 });
        tone(960, 0.025, { type: 'square', gain: 0.045, end: 620, when: 0.02 });
      }
    },
    enemyShot(distance = 12, pan = 0) {
      const level = 1 / (1 + Math.max(0, distance) * 0.09);
      noise(0.13, { frequency: 2500, gain: 0.55 * level, pan, wet: 0.25 });
      tone(112, 0.1, { type: 'triangle', gain: 0.3 * level, end: 48, pan });
    },
    enemyFootstep(distance = 8, pan = 0, occluded = false) {
      // A limited hearing radius keeps distant bots from filling the mix. The
      // softer, darker sound behind cover conveys proximity without a sharp
      // footfall that would imply an enemy is standing in the open.
      if (!Number.isFinite(distance) || distance >= 18) return;
      const level = Math.pow(1 - clamp(distance, 0, 18) / 18, 1.35);
      const side = Number.isFinite(pan) ? clamp(pan, -1, 1) : 0;
      const cover = occluded ? 0.38 : 1;
      noise(0.09, {
        frequency: occluded ? 440 : random(1050, 1400),
        gain: 0.28 * level * cover, pan: side, wet: 0.025,
      });
      tone(random(100, 120), 0.105, {
        type: 'triangle', gain: 0.2 * level * cover, end: 43, pan: side, wet: 0,
      });
    },
    incoming(pan = 0) {
      const side = Number.isFinite(pan) ? clamp(pan, -1, 1) : 0;
      noise(0.1, { frequency: 4200, type: 'bandpass', gain: 0.14, pan: side, wet: 0 });
      tone(1450, 0.095, { gain: 0.025, end: 680, pan: side, wet: 0 });
    },
    heartbeat() {
      tone(68, 0.14, { gain: 0.15, end: 43, wet: 0 });
      tone(61, 0.13, { gain: 0.105, end: 40, when: 0.19, wet: 0 });
    },
    alert() {
      tone(740, 0.09, { type: 'triangle', gain: 0.085, end: 800, wet: 0 });
      tone(980, 0.105, { type: 'triangle', gain: 0.075, end: 1040, when: 0.105, wet: 0 });
    },
    hit(head = false) {
      tone(head ? 1550 : 980, 0.045, { type: 'triangle', gain: 0.2, end: head ? 2050 : 760, wet: 0 });
      if (head) tone(2150, 0.055, { gain: 0.14, when: 0.045, wet: 0 });
    },
    kill() {
      tone(700, 0.07, { type: 'triangle', gain: 0.13 });
      tone(1100, 0.12, { type: 'triangle', gain: 0.17, when: 0.065 });
    },
    empty() { tone(1800, 0.023, { type: 'square', gain: 0.07, end: 850, wet: 0 }); },
    reload(duration = 2.2) {
      const length = Math.max(0.25, duration);
      noise(0.06, { frequency: 2500, type: 'bandpass', gain: 0.2, when: 0.05 });
      tone(430, 0.055, { type: 'triangle', gain: 0.12, end: 290, when: 0.08 });
      noise(0.085, { frequency: 1450, type: 'bandpass', gain: 0.24, when: length * 0.55 });
      noise(0.045, { frequency: 3400, gain: 0.28, when: length - 0.12 });
      tone(620, 0.04, { type: 'triangle', gain: 0.13, end: 380, when: length - 0.09 });
    },
    switch() { noise(0.09, { frequency: 1800, gain: 0.12, type: 'bandpass', wet: 0 }); },
    hurt() {
      noise(0.13, { frequency: 430, gain: 0.52, wet: 0 });
      tone(85, 0.2, { type: 'triangle', gain: 0.27, end: 43, wet: 0 });
    },
    death() {
      tone(240, 0.8, { type: 'triangle', gain: 0.3, end: 35, wet: 0, notification: true });
      noise(0.55, { frequency: 420, gain: 0.35, wet: 0, notification: true });
    },
    wave(clear = false) {
      const notes = clear ? [523, 659, 784] : [440, 587];
      notes.forEach((frequency, index) => tone(frequency, 0.22, {
        type: 'triangle', gain: 0.18, when: index * 0.12, wet: 0.18,
      }));
    },
    footstep(sprint = false) {
      noise(0.065, { frequency: random(500, 720), gain: sprint ? 0.252 : 0.147, wet: 0.035 });
      tone(random(75, 95), 0.05, { gain: sprint ? 0.119 : 0.063, end: 40, wet: 0 });
    },
    throw() { noise(0.17, { frequency: 1400, gain: 0.15, type: 'bandpass', wet: 0.02 }); },
    bounce() {
      tone(random(600, 820), 0.045, { type: 'triangle', gain: 0.11, end: 330, wet: 0.18 });
      noise(0.04, { frequency: 1500, gain: 0.08 });
    },
    boom() {
      noise(0.75, { frequency: 380, gain: 1.2, wet: 0.22 });
      noise(0.14, { frequency: 3400, gain: 0.62, wet: 0.2 });
      tone(74, 0.65, { gain: 0.7, end: 27, wet: 0.14 });
      noise(0.48, { frequency: 1050, gain: 0.22, when: 0.1, wet: 0.3 });
    },
    planted() {
      [0, 0.15, 0.3].forEach((when, index) => tone(index === 2 ? 1175 : 880, 0.11, {
        gain: 0.18, when, type: 'triangle', wet: 0.1,
      }));
    },
    beep() { tone(1320, 0.075, { type: 'sine', gain: 0.15, wet: 0.045 }); },
  };
}
