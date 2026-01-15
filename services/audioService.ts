
class AudioService {
  private context: AudioContext | null = null;
  private isMusicPlaying: boolean = false;
  private nextNoteTime: number = 0;
  private beatIndex: number = 0;
  private schedulerTimer: number | null = null;
  private tempo: number = 100; // 稍微放慢速度，更休閒
  private noiseBuffer: AudioBuffer | null = null;

  // C Major Scale frequencies (C4 to C6)
  private scale: number[] = [
    261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, // C4 - B4
    523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, // C5 - B5
    1046.50 // C6
  ];

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
    // 讓鳥叫聲更清脆
    this.createChirp(t, 2000, 1000, 0.1);
    this.createChirp(t + 0.08, 2500, 1200, 0.1);
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
    oscillator.frequency.setValueAtTime(100, t);
    oscillator.frequency.exponentialRampToValueAtTime(10, t + 0.4);
    oscGain.gain.setValueAtTime(0.5, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    const noiseSource = this.context.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    const noiseFilter = this.context.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(800, t);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, t + 0.4);
    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(0.6, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    oscillator.connect(oscGain);
    oscGain.connect(this.context.destination);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.context.destination);
    
    oscillator.start(t); oscillator.stop(t + 0.4);
    noiseSource.start(t); noiseSource.stop(t + 0.4);
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
    // 16th notes
    const secondsPerStep = (60.0 / this.tempo) / 4;
    
    while (this.nextNoteTime < this.context.currentTime + 0.1) {
      this.playStep(this.nextNoteTime, this.beatIndex);
      this.nextNoteTime += secondsPerStep;
      this.beatIndex++; 
    }
    this.schedulerTimer = window.setTimeout(() => this.scheduleNote(), 25);
  }

  private playStep(time: number, globalStep: number) {
    if (!this.context) return;
    
    const stepInBar = globalStep % 16;
    const barIndex = Math.floor(globalStep / 16) % 4; // 4 bar loop

    // Chord Progression: I - V - vi - IV (C - G - Am - F)
    // Roots: C3(130.8), G2(98), A2(110), F2(87.3)
    const chordRoots = [130.81, 98.00, 110.00, 87.31]; 
    const currentRoot = chordRoots[barIndex];

    // 1. Light Percussion (Woodblock / Soft Kick style)
    if (stepInBar === 0 || stepInBar === 8) {
       this.playSoftKick(time);
    }
    if (stepInBar === 4 || stepInBar === 12) {
       this.playShaker(time, 0.05); // Snare/Clap replacement
    }
    if (stepInBar % 2 === 0) {
       this.playShaker(time, 0.02); // Hi-hat replacement
    }

    // 2. Bass (Round Triangle Wave) - Simple pattern
    if (stepInBar === 0 || stepInBar === 10) {
        this.playBass(time, currentRoot, 0.4);
    }
    if (stepInBar === 14) {
        // Octave jump or 5th for variation
        this.playBass(time, currentRoot * 1.5, 0.2); 
    }

    // 3. Arpeggio / Melody (Marimba Style)
    // Play on 16th notes, but sparse
    // C Major Pentatonic: C, D, E, G, A
    const pentatonicRatios = [1, 9/8, 5/4, 3/2, 5/3, 2];
    
    // Randomly play notes to keep it diverse, but stick to harmony
    // Higher chance to play on downbeats, lower on offbeats
    const playProb = (stepInBar % 4 === 0) ? 0.6 : 0.2;
    
    if (Math.random() < playProb) {
        // Pick a note that harmonizes with current root
        const ratio = pentatonicRatios[Math.floor(Math.random() * pentatonicRatios.length)];
        // Transpose root up 2 octaves for melody
        const noteFreq = currentRoot * 4 * ratio; 
        
        // Humanize timing slightly
        const swing = (stepInBar % 2 === 1) ? 0.02 : 0;
        this.playMarimba(time + swing, noteFreq);
    }
  }

  private playSoftKick(time: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    osc.connect(gain); gain.connect(this.context.destination);
    osc.start(time); osc.stop(time + 0.15);
  }

  private playShaker(time: number, vol: number) {
    if (!this.context || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass'; 
    filter.frequency.value = 6000;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.03);
    source.connect(filter); filter.connect(gain); gain.connect(this.context.destination);
    source.start(time); source.stop(time + 0.03);
  }

  private playBass(time: number, freq: number, duration: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    osc.type = 'triangle'; // Softer than square/saw
    const gain = this.context.createGain();
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.linearRampToValueAtTime(0, time + duration);
    osc.connect(gain); gain.connect(this.context.destination);
    osc.start(time); osc.stop(time + duration);
  }

  private playMarimba(time: number, freq: number) {
    if (!this.context) return;
    const osc = this.context.createOscillator();
    osc.type = 'sine'; // Pure tone
    const gain = this.context.createGain();
    
    osc.frequency.setValueAtTime(freq, time);
    
    // Marimba envelope: Instant attack, fast decay
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    
    osc.connect(gain); gain.connect(this.context.destination);
    osc.start(time); osc.stop(time + 0.3);
  }
}

export const audioService = new AudioService();
