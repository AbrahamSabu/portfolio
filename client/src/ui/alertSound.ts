import type { StoredToggle } from '../state/storedToggle';

/**
 * One short two-note ping for alerts (emergency squawks, watch-area
 * crossings), synthesised on the spot so there's no audio asset to load.
 * Off by default: a page that makes noise unasked is rude, and autoplay
 * rules would block it anyway. The switch lives in the Layers menu, and
 * flipping it is the user gesture that lets the AudioContext run.
 */
export class AlertSound {
  private ctx: AudioContext | null = null;

  constructor(private readonly enabled: StoredToggle) {}

  ping(): void {
    if (!this.enabled.value) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const start = this.ctx.currentTime;
      // A fifth apart, quiet, over in under half a second.
      for (const [freq, at] of [
        [880, 0],
        [1318.5, 0.14],
      ] as const) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start + at);
        gain.gain.linearRampToValueAtTime(0.08, start + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.3);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(start + at);
        osc.stop(start + at + 0.35);
      }
    } catch {
      // No sound is a quieter watchfloor, not a broken one.
    }
  }
}
