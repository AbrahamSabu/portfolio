/**
 * Exponential backoff with "equal jitter": each failure doubles the window
 * (up to a cap) and we wait a random point in its upper half. The jitter stops
 * clients retrying in lockstep; the guaranteed half stops us retrying almost
 * immediately. `random` is injectable so tests are deterministic.
 */
export class Backoff {
  private failures = 0;

  constructor(
    private readonly baseMs: number,
    private readonly maxMs: number,
    private readonly random: () => number = Math.random,
  ) {}

  get attempts(): number {
    return this.failures;
  }

  /** Record a failure and return how long to wait before trying again. */
  next(): number {
    const window = Math.min(this.maxMs, this.baseMs * 2 ** this.failures);
    this.failures++;
    return Math.round(window / 2 + this.random() * (window / 2));
  }

  reset(): void {
    this.failures = 0;
  }
}
