type Listener = (id: string | null, previous: string | null) => void;

/** Which track the operator has selected, and whether the map should follow it. */
export class Selection {
  private current: string | null = null;
  private following = false;
  private readonly listeners = new Set<Listener>();

  get id(): string | null {
    return this.current;
  }

  get follow(): boolean {
    return this.following;
  }

  select(id: string | null): void {
    if (id === this.current) return;
    const previous = this.current;
    this.current = id;
    this.following = false;
    for (const l of this.listeners) l(id, previous);
  }

  setFollow(on: boolean): void {
    if (this.following === on) return;
    this.following = on && this.current !== null;
    for (const l of this.listeners) l(this.current, this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
