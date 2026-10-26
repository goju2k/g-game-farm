import type { AudioEngine } from '@g-game-farm/ribs';

/**
 * data/sounds.json: sound id -> file (relative to the asset base). Event
 * scripts and game code refer to sounds only by id; a missing file just
 * leaves that id silent.
 */
export interface SoundManifest {
  readonly sfx: Readonly<Record<string, string>>;
  readonly bgm: Readonly<Record<string, string>>;
}

export const EMPTY_SOUND_MANIFEST: SoundManifest = { sfx: {}, bgm: {} };

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export function parseSoundManifest(json: unknown): SoundManifest {
  const data = (json ?? {}) as { sfx?: unknown; bgm?: unknown };
  return { sfx: stringRecord(data.sfx), bgm: stringRecord(data.bgm) };
}

/** Fetches the manifest (no manifest: no sounds). */
export async function loadSoundManifest(baseUrl: string): Promise<SoundManifest> {
  try {
    const response = await fetch(`${baseUrl}data/sounds.json`);
    return response.ok ? parseSoundManifest(await response.json()) : EMPTY_SOUND_MANIFEST;
  } catch {
    return EMPTY_SOUND_MANIFEST;
  }
}

/** Starts decoding every sound in the background — the game doesn't wait; a sound plays once it's ready. */
export function preloadSounds(audio: AudioEngine, manifest: SoundManifest, baseUrl: string): Promise<unknown> {
  return Promise.all([...Object.entries(manifest.sfx), ...Object.entries(manifest.bgm)].map(([id, file]) => audio.load(id, baseUrl + file)));
}
