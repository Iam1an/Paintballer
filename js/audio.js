/** Procedural audio system using Web Audio API */
class AudioSystem {
  constructor() {
    this.ctx = null;
    this._enabled = false;
    this._initOnClick();
  }

  /** Web Audio requires user interaction to start */
  _initOnClick() {
    const init = () => {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._enabled = true;
      window.removeEventListener('click', init);
      window.removeEventListener('keydown', init);
    };
    window.addEventListener('click', init);
    window.addEventListener('keydown', init);
  }

  /**
   * Play a gunshot sound.
   * @param {number} distance — world-pixel distance from listener to shooter
   * @param {number} maxDist — max distance for audibility (px)
   * @param {string} type — 'rifle' | 'smg' | 'mg'
   */
  gunshot(distance, maxDist, type) {
    if (!this._enabled || !this.ctx) return;

    const vol = Math.max(0, 1 - distance / maxDist);
    if (vol < 0.02) return; // too far to hear

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Randomize pitch and volume
    const pitchShift = 0.8 + Math.random() * 0.4; // 0.8x to 1.2x
    const volRand = vol * (0.7 + Math.random() * 0.3);

    // Base parameters by weapon type
    let freq, decay, noiseVol;
    if (type === 'mg') {
      freq = 120 * pitchShift; decay = 0.06; noiseVol = 0.5;
    } else if (type === 'smg') {
      freq = 200 * pitchShift; decay = 0.04; noiseVol = 0.35;
    } else {
      // rifle — sharper, louder
      freq = 160 * pitchShift; decay = 0.1; noiseVol = 0.6;
    }

    const masterGain = ctx.createGain();
    masterGain.gain.value = volRand * 0.15; // overall volume
    masterGain.connect(ctx.destination);

    // Noise burst (the "crack")
    const noiseLen = 0.03 + Math.random() * 0.02;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * noiseVol;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + noiseLen);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2000 + Math.random() * 2000;
    noiseFilter.Q.value = 0.5;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + noiseLen);

    // Low thud (the "boom")
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + decay);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + decay);

    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + decay + 0.01);
  }

  /** Explosion sound */
  explosion(distance, maxDist) {
    if (!this._enabled || !this.ctx) return;
    const vol = Math.max(0, 1 - distance / maxDist);
    if (vol < 0.02) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const volRand = vol * (0.8 + Math.random() * 0.2);

    const masterGain = ctx.createGain();
    masterGain.gain.value = volRand * 0.25;
    masterGain.connect(ctx.destination);

    // Long noise burst
    const noiseLen = 0.3;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      const t = i / noiseData.length;
      noiseData[i] = (Math.random() * 2 - 1) * (1 - t);
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 800;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(masterGain);
    noiseSource.start(now);

    // Deep boom
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60 + Math.random() * 20, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /** Paint splat / UI click sound */
  splat() {
    if (!this._enabled || !this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 0.15;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.12;
    masterGain.connect(ctx.destination);

    // Noise splat (the main impact)
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      const t = i / noiseData.length;
      noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 0.8);
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1200 + Math.random() * 800;
    noiseFilter.Q.value = 3;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + duration);

    // Short pitch drop for splat character
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400 + Math.random() * 100, now);
    osc.frequency.exponentialRampToValueAtTime(180 + Math.random() * 80, now + duration * 0.6);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.7);

    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration);
  }
}

const Audio = new AudioSystem();
