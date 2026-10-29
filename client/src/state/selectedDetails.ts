import type { DetailsMessage, TrackDetails } from '@watchfloor/shared';

/** The selected track's details, as the server last sent them. */
export class SelectedDetails {
  private trackId: string | null = null;
  private current: TrackDetails | undefined;
  private readonly listeners = new Set<() => void>();

  get id(): string | null {
    return this.trackId;
  }

  /** Undefined until the server answers for the current track. */
  get details(): TrackDetails | undefined {
    return this.current;
  }

  select(id: string | null): void {
    if (id === this.trackId) return;
    this.trackId = id;
    this.current = undefined;
    this.notify();
  }

  load(message: DetailsMessage): void {
    if (message.id !== this.trackId) return; // an answer for a track no longer selected
    this.current = message.details;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
