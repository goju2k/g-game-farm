import type { IStorageAdapter } from '@g-game-farm/ribs';
import type { RogueliteSession } from '../session.js';

/**
 * Continue (demo plan Q5): a checkpoint is taken as a room starts — the room,
 * the entry point used, the player's form, and every once-only event seen
 * *before* entering. Restoring replays that room from its start exactly as
 * the first time, so a checkpoint can never leave the player stuck.
 * (Flags are per room and reset on entry, so they need no saving.)
 *
 * Storage is the engine's IStorageAdapter, injected by the host (platform
 * abstraction). Without one — or when it fails (private mode, quota) — the
 * game still runs, just without continue.
 */
export interface Checkpoint {
  readonly room: string;
  readonly entry?: string;
  readonly form?: string;
  readonly seenEvents: readonly string[];
  /** Progress flags and unlocked skills at that moment (session.flags / skills). */
  readonly flags?: readonly string[];
  readonly skills?: readonly string[];
}

export interface SaveData {
  readonly version: 1;
  readonly checkpoint: Checkpoint;
  readonly savedAt: number;
}

export interface SoundSettings {
  /** 0..1 */
  readonly bgm: number;
  readonly sfx: number;
}

export interface Preferences {
  readonly sound: SoundSettings;
  /** The keyboard controls card was shown once on a first start (Q8). */
  readonly seenControls: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { sound: { bgm: 0.7, sfx: 0.8 }, seenControls: false };

const SAVE_KEY = 'sentinel-demo0:save';
const PREFS_KEY = 'sentinel-demo0:prefs';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Validates stored JSON; anything unexpected (old format, hand-edited, another game's key) is no save. */
export function parseSave(text: string | undefined, knownRooms: readonly string[]): SaveData | undefined {
  if (!text) return undefined;
  try {
    const data = JSON.parse(text) as Partial<SaveData>;
    const cp = data?.checkpoint as Partial<Checkpoint> | undefined;
    if (data?.version !== 1 || !cp || typeof cp.room !== 'string' || !knownRooms.includes(cp.room) || !isStringArray(cp.seenEvents)) return undefined;
    return {
      version: 1,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
      checkpoint: {
        room: cp.room,
        seenEvents: [...cp.seenEvents],
        ...(typeof cp.entry === 'string' ? { entry: cp.entry } : {}),
        ...(typeof cp.form === 'string' ? { form: cp.form } : {}),
        ...(isStringArray(cp.flags) ? { flags: [...cp.flags] } : {}),
        ...(isStringArray(cp.skills) ? { skills: [...cp.skills] } : {}),
      },
    };
  } catch {
    return undefined;
  }
}

function clamp01(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

export function parsePreferences(text: string | undefined): Preferences {
  if (!text) return DEFAULT_PREFERENCES;
  try {
    const data = JSON.parse(text) as { sound?: Partial<SoundSettings>; seenControls?: unknown };
    return {
      sound: { bgm: clamp01(data?.sound?.bgm, DEFAULT_PREFERENCES.sound.bgm), sfx: clamp01(data?.sound?.sfx, DEFAULT_PREFERENCES.sound.sfx) },
      seenControls: data?.seenControls === true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Put a checkpoint back into the session; returns the room to load. */
export function restoreCheckpoint(session: RogueliteSession, checkpoint: Checkpoint): string {
  session.seenEvents.clear();
  for (const key of checkpoint.seenEvents) session.seenEvents.add(key);
  session.flags.clear();
  for (const flag of checkpoint.flags ?? []) session.flags.add(flag);
  session.skills.clear();
  for (const skill of checkpoint.skills ?? []) session.skills.add(skill);
  session.pendingEntryId = checkpoint.entry;
  return checkpoint.room;
}

/** A fresh run from the beginning ("처음부터"). */
export function resetSession(session: RogueliteSession): void {
  session.seenEvents.clear();
  session.flags.clear();
  session.skills.clear();
  session.pendingEntryId = undefined;
  session.currentForm = 'flame';
}

export interface SaveStore {
  loadSave(): Promise<SaveData | undefined>;
  writeCheckpoint(checkpoint: Checkpoint): Promise<void>;
  clearSave(): Promise<void>;
  loadPreferences(): Promise<Preferences>;
  writePreferences(preferences: Preferences): Promise<void>;
}

/** Every call swallows storage failures — saving is a convenience, never a reason to stop the game. */
export function createSaveStore(storage: IStorageAdapter | undefined, knownRooms: readonly string[], now: () => number = Date.now): SaveStore {
  const safe = async <T>(run: (store: IStorageAdapter) => Promise<T>, fallback: T): Promise<T> => {
    if (!storage) return fallback;
    try {
      return await run(storage);
    } catch {
      return fallback;
    }
  };
  return {
    loadSave: () => safe(async (store) => parseSave(await store.get(SAVE_KEY), knownRooms), undefined),
    writeCheckpoint: (checkpoint) => safe((store) => store.set(SAVE_KEY, JSON.stringify({ version: 1, checkpoint, savedAt: now() } satisfies SaveData)), undefined),
    clearSave: () => safe((store) => store.remove(SAVE_KEY), undefined),
    loadPreferences: () => safe(async (store) => parsePreferences(await store.get(PREFS_KEY)), DEFAULT_PREFERENCES),
    writePreferences: (preferences) => safe((store) => store.set(PREFS_KEY, JSON.stringify(preferences)), undefined),
  };
}
