'use client';
import { useSyncExternalStore } from 'react';
import type { SnapshotStore } from './snapshot-store.js';

/**
 * Same getSnapshot passed for both the client and server snapshot getters —
 * safe because every SnapshotStore's initial value is deterministic (the
 * caller-supplied `initial` in createSnapshotStore), so there's no
 * hydration mismatch risk, and GameCanvas never meaningfully renders real
 * game state during SSR anyway (the engine only exists client-side).
 */
export function useSnapshotStore<T>(store: SnapshotStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
