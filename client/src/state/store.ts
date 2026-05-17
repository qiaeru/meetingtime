type Listener<T> = (value: T) => void;

// Tiny home-grown observable. subscribe() fires synchronously on attach so
// callers always see the current value before any future set().
export class Observable<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    this.value = next;
    for (const l of this.listeners) l(next);
  }

  update(updater: (prev: T) => T): void {
    this.set(updater(this.value));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    listener(this.value);
    return () => this.listeners.delete(listener);
  }
}
