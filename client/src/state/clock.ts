/**
 * Estimates the server's clock from the browser's.
 *
 * Track ages ("last report 4 s ago") and dead reckoning both compare a
 * server timestamp against "now", so a browser clock that's a few seconds
 * off would make every track look stale or jump. Each message carries
 * serverTime; the sample with the least network delay is the best estimate,
 * so we jump up to better samples immediately and drift down slowly.
 */
export class ServerClock {
  private offsetMs = 0;
  private hasSample = false;

  update(serverTime: number, receivedAt = Date.now()): void {
    const sample = serverTime - receivedAt;
    if (!this.hasSample || sample > this.offsetMs) {
      this.offsetMs = sample;
      this.hasSample = true;
    } else {
      this.offsetMs += (sample - this.offsetMs) * 0.05;
    }
  }

  /** Current time on the server's clock, ms since epoch. */
  now(): number {
    return Date.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }
}
