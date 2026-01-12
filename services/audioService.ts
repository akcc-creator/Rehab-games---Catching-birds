class AudioService {
  private context: AudioContext | null = null;
  private isMusicPlaying: boolean = false;
  private nextNoteTime: number = 0;
  private beatIndex: number = 0;
  private schedulerTimer: number | null = null;
  private tempo: number = 130; // Faster for more excitement
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.createNoiseBuffer();
    } catch (e) {
      console.error('Web Audio API not supported', e);
    }
  }

  private createNoiseBuffer() {
    if (!this.context) return;
    const bufferSize = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private ensureContext() {
    if (this.context && this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  playBirdSound() {
    this.ensureContext();
    if (!this.context) return;
    const t = this.context.currentTime;
    this.createChirp(t, 2200, 1100, 0.2);
    this.createChirp(t + 0.05, 2600, 1300, 0.2);
  }

  private createChirp(startTime: number, startFreq: number, endFreq: number, vol: number) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(startFreq, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, startTime + 0.1);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
    oscillator.connect(gainNode);
    gainNode.connect(this.context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.1);
  }

  playBombSound() {
    this.ensureContext();
    if (!this.context || !this.noiseBuffer) return;
    const t = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const oscGain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(60, t);
    oscillator.frequency.exponentialRampToValueAtTime(10, t + 0.6);
    oscGain.gain.setValueAtTime(0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    const noiseSource = this.context.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    const noiseFilter = this.context.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(600, t);
    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    oscillator.connect(oscGain);
    oscGain.connect(this.context.destination);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.context.destination);
    oscillator.start(t); oscillator.stop(t + 0.6);
    noiseSource.start(t); noiseSource.stop(t + 0.5);
  }

  startMusic() {
    this.ensureContext();
    if (this.isMusicPlaying) return;
    this.isMusicPlaying = true;
    this.beatIndex = 0;
    if (this.context) {
      this.nextNoteTime = this.context.currentTime + 0.1;
      this.scheduleNote();
    }
  }

  stopMusic() {
    this.isMusicPlaying = false;
    if (this.schedulerTimer) {
      window.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleNote() {
    if (!this.isMusicPlaying || !this.context) return;
    const secondsPer16th = (60.0 / this.tempo) / 4;
    while (this.nextNoteTime < this.context.currentTime + 0.1) {
      this.playStep(this.nextNoteTime, this.beatIndex);
      this.nextNoteTime += secondsPer16th;
      this.beatIndex = (this.beatIndex + 1) % 64;
    }
    this.schedulerTimer = window.setTimeout(() => this.scheduleNote(), 25);
  }

  private playStep(time: number, step: number) {
    if (!this.context) return;
    
    // Dynamic Kick Pattern
    if (step % 8 === 0 || step % 16 === 14) this.playKick(time);
    // Energetic Snare
    if (step % 16 === 8 || step % 16 === 4) this.playSnare(time);
    // Rapid Hats
    if (step % 2 === 0) this.playHiHat(time, step % 8 === 0 ? 0.06 : 0.03);
    
    const bar = Math.floor(step / 16);
    const chordRoots = [130.81, 98.00, 110.00, 87.31];
    const currentRoot = chordRoots[bar];

    if (step % 4 === 0 || step % 16 === 6 || step % 16 === 11) {
        this.playBass(time, currentRoot / 2); // Deeper bass
    }

    const melodySteps = [0, 2, 4, 6, 8, 10, 12, 14];
    if (melodySteps.includes(step % 16) && Math.random() > 0.3) {
        const scale = [0, 3, 5, 7, 10, 12];
        const noteIndex = Math.floor(Math.random() * scale.length);
        const freq = currentRoot * 2 * Math.pow(2, scale[noteIndex] / 12);
        this.playLead(time, freq, 0.15);
    }
  }

  private playKick(time: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc.connect(gain); gain.connect(this.context.destination);
    osc.start(time); osc.stop(time + 0.3);
  }

  private playSnare(time: number) {
    if (!this.context || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 1500;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    source.connect(filter); filter.connect(gain); gain.connect(this.context.destination);
    source.start(time); source.stop(time + 0.1);
  }

  private playHiHat(time: number, vol: number) {
    if (!this.context || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 8000;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.04);
    source.connect(filter); filter.connect(gain); gain.connect(this.context.destination);
    source.start(time); source.stop(time + 0.04);
  }

  private playBass(time: number, freq: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    osc.type = 'square'; // More aggressive bass
    const gain = this.context.createGain();
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.linearRampToValueAtTime(0, time + 0.3);
    osc.connect(gain); gain.connect(this.context.destination);
    osc.start(time); osc.stop(time + 0.3);
  }

  private playLead(time: number, freq: number, duration: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 2000;
    const gain = this.context.createGain();
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.05, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(filter); filter.connect(gain); gain.connect(this.context.destination);
    osc.start(time); osc.stop(time + duration);
  }
}

export const audioService = new AudioService();