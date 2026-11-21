export type BgmTrack = 'home' | 'street' | 'minigame';

interface NoteStep {
  lead: number;
  bass: number;
  arp?: number;
}

const TRACKS: Record<BgmTrack, { tempoMs: number; steps: NoteStep[] }> = {
  // Warm NDS Pokémon Twinleaf/New Bark Town inspired cozy melody
  home: {
    tempoMs: 230,
    steps: [
      { lead: 523.25, bass: 130.81, arp: 329.63 }, { lead: 659.25, bass: 196.0, arp: 392.0 },
      { lead: 783.99, bass: 130.81, arp: 329.63 }, { lead: 659.25, bass: 196.0 },
      { lead: 698.46, bass: 174.61, arp: 349.23 }, { lead: 659.25, bass: 174.61 },
      { lead: 587.33, bass: 196.0, arp: 392.0 },   { lead: 523.25, bass: 196.0 },
      { lead: 587.33, bass: 146.83, arp: 293.66 }, { lead: 659.25, bass: 196.0 },
      { lead: 698.46, bass: 146.83, arp: 349.23 }, { lead: 783.99, bass: 196.0 },
      { lead: 659.25, bass: 130.81, arp: 329.63 }, { lead: 587.33, bass: 196.0 },
      { lead: 523.25, bass: 130.81, arp: 392.0 },  { lead: 0, bass: 130.81 }
    ]
  },
  // Lively HK Community Adventure March
  street: {
    tempoMs: 185,
    steps: [
      { lead: 587.33, bass: 196.0, arp: 392.0 }, { lead: 659.25, bass: 196.0 },
      { lead: 783.99, bass: 246.94, arp: 493.88 }, { lead: 783.99, bass: 196.0 },
      { lead: 880.0, bass: 220.0, arp: 440.0 },  { lead: 783.99, bass: 220.0 },
      { lead: 659.25, bass: 164.81, arp: 329.63 }, { lead: 587.33, bass: 196.0 },
      { lead: 523.25, bass: 130.81, arp: 329.63 }, { lead: 659.25, bass: 164.81 },
      { lead: 783.99, bass: 196.0, arp: 392.0 },   { lead: 987.77, bass: 246.94 },
      { lead: 880.0, bass: 220.0, arp: 440.0 },    { lead: 783.99, bass: 196.0 },
      { lead: 783.99, bass: 196.0, arp: 493.88 },  { lead: 0, bass: 146.83 }
    ]
  },
  // Fast Upbeat Arcade Mini-Game Chiptune Loop
  minigame: {
    tempoMs: 145,
    steps: [
      { lead: 659.25, bass: 164.81, arp: 493.88 }, { lead: 783.99, bass: 164.81 },
      { lead: 987.77, bass: 246.94, arp: 587.33 }, { lead: 783.99, bass: 196.0 },
      { lead: 880.0, bass: 220.0, arp: 523.25 },   { lead: 1046.5, bass: 220.0 },
      { lead: 987.77, bass: 246.94 },              { lead: 783.99, bass: 196.0 },
      { lead: 698.46, bass: 174.61, arp: 440.0 },  { lead: 880.0, bass: 174.61 },
      { lead: 783.99, bass: 196.0, arp: 493.88 },  { lead: 659.25, bass: 196.0 },
      { lead: 587.33, bass: 146.83 },              { lead: 659.25, bass: 196.0 },
      { lead: 783.99, bass: 246.94, arp: 587.33 }, { lead: 1046.5, bass: 196.0 }
    ]
  }
};

export class RetroSound {
  private ctx: AudioContext | null = null;
  public sfxMuted = false;
  public bgmMuted = false;
  private bgmTimer: number | null = null;
  private currentTrack: BgmTrack = 'home';
  private stepIdx = 0;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playBgm(track: BgmTrack): void {
    this.currentTrack = track;
    this.stopBgm();
    if (this.bgmMuted) return;
    const cfg = TRACKS[track];
    this.stepIdx = 0;
    this.bgmTimer = window.setInterval(() => {
      if (this.bgmMuted) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const st = cfg.steps[this.stepIdx % cfg.steps.length];
      this.stepIdx++;
      const dur = (cfg.tempoMs / 1000) * 0.85;
      if (st.lead > 0) this.rawNote(ctx, st.lead, dur, 'triangle', 0.045);
      if (st.bass > 0) this.rawNote(ctx, st.bass, dur * 1.05, 'sine', 0.055);
      if (st.arp) this.rawNote(ctx, st.arp, dur * 0.55, 'square', 0.015);
    }, cfg.tempoMs);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  toggleBgm(): boolean {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgmMuted) this.stopBgm();
    else this.playBgm(this.currentTrack);
    return !this.bgmMuted;
  }

  private rawNote(ctx: AudioContext, freq: number, duration: number, type: OscillatorType, vol: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  tone(freq: number, duration = 0.1, type: OscillatorType = 'square', vol = 0.08): void {
    if (this.sfxMuted) return;
    const ctx = this.ensure();
    if (ctx) this.rawNote(ctx, freq, duration, type, vol);
  }

  step(): void { this.tone(150, 0.03, 'triangle', 0.025); }
  pop(): void { this.tone(580, 0.07, 'sine', 0.09); }
  combo(n: number): void { this.tone(440 + Math.min(n, 8) * 65, 0.09, 'triangle', 0.11); }
  spray(): void { this.tone(920, 0.06, 'sawtooth', 0.04); }
  wrong(): void { this.tone(165, 0.2, 'sawtooth', 0.09); }
  success(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      window.setTimeout(() => this.tone(f, 0.15, 'triangle', 0.11), idx * 85);
    });
  }
}

export const sound = new RetroSound();
