/**
 * The minimal bridge between the game loop's per-tick state and React's
 * infrequent-render world — a plain pub/sub cell shaped to plug directly
 * into `useSyncExternalStore` (see use-snapshot-store.ts). The game-loop
 * owner (a render-phase system, typically) calls `set()` every tick; this
 * only actually notifies subscribers when the value changes (`Object.is`),
 * so calling `set()` unconditionally every frame never causes a React
 * re-render unless the published value itself moved — no manual diffing
 * needed at the call site.
 */
export interface SnapshotStore<T> {
  getSnapshot(): T;
  subscribe(onStoreChange: () => void): () => void;
  set(next: T): void;
}

export function createSnapshotStore<T>(initial: T): SnapshotStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => value,
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    set(next) {
      if (Object.is(next, value)) {
        return;
      }
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
