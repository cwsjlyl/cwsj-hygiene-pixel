export class RetroSound {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  tone(freq: number, duration = 0.1, type: OscillatorType = 'square', gainVal = 0.08): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  step(): void {
    this.tone(130, 0.035, 'triangle', 0.03);
  }

  pop(): void {
    this.tone(520, 0.08, 'sine', 0.1);
  }

  wrong(): void {
    this.tone(180, 0.18, 'sawtooth', 0.1);
  }

  success(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      window.setTimeout(() => this.tone(f, 0.14, 'triangle', 0.11), idx * 90);
    });
  }
}

export const sound = new RetroSound();
