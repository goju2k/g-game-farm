import type { AudioContextLike, IStorageAdapter } from '@g-game-farm/roguelite';

/**
 * The browser implementations of the platform pieces the game takes
 * (platform abstraction, CLAUDE.md: the engine/game define interfaces, the
 * host supplies them). A deployment app would carry its own copy of this.
 */

/** localStorage, or undefined where it's unavailable (private mode, blocked site data) — the game then runs without continue. */
export function browserStorage(): IStorageAdapter | undefined {
  try {
    const probe = '__storage_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
  } catch {
    return undefined;
  }
  return {
    get: async (key) => window.localStorage.getItem(key) ?? undefined,
    set: async (key, value) => window.localStorage.setItem(key, value),
    remove: async (key) => window.localStorage.removeItem(key),
  };
}

export function browserAudioContext(): AudioContextLike | undefined {
  const ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return ctor ? (new ctor() as unknown as AudioContextLike) : undefined;
}
