import type { AudioEngine } from '@g-game-farm/ribs';

/**
 * data/sounds.json: sound id -> file (relative to the asset base). Event
 * scripts and game code refer to sounds only by id; a missing file just
 * leaves that id silent.
 */
/** A sound's files (first that decodes wins) and its own level (1 = as recorded). */
export interface SoundEntry {
  readonly files: readonly string[];
  readonly gain?: number;
}

export interface SoundManifest {
  /** id -> file, or { "files": [...], "gain": n } for format fallbacks / a per-sound level. */
  readonly sfx: Readonly<Record<string, SoundEntry>>;
  readonly bgm: Readonly<Record<string, SoundEntry>>;
  /** Animation frame tag -> sfx id: the sound plays on the drawn frame (sound-director.ts). */
  readonly tags: Readonly<Record<string, string>>;
  /** Tag keys written { "sfx": id, "once": true }: a looping clip plays them at its start only, not on every lap. */
  readonly onceTags: ReadonlySet<string>;
  /** Room id -> the music that plays there by default (event-director.ts applyRoomBgm). */
  readonly rooms: Readonly<Record<string, string>>;
}

export const EMPTY_SOUND_MANIFEST: SoundManifest = { sfx: {}, bgm: {}, tags: {}, onceTags: new Set(), rooms: {} };

function stringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** "key": id, or "key": { "sfx": id, "once": true }. */
function tagRecord(value: unknown): { tags: Record<string, string>; onceTags: Set<string> } {
  const tags: Record<string, string> = {};
  const onceTags = new Set<string>();
  if (typeof value !== 'object' || value === null) return { tags, onceTags };
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') tags[key] = raw;
    else if (typeof raw === 'object' && raw !== null && typeof (raw as { sfx?: unknown }).sfx === 'string') {
      tags[key] = (raw as { sfx: string }).sfx;
      if ((raw as { once?: unknown }).once === true) onceTags.add(key);
    }
  }
  return { tags, onceTags };
}

function entryRecord(value: unknown): Record<string, SoundEntry> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, SoundEntry> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      out[id] = { files: [raw] };
    } else if (typeof raw === 'object' && raw !== null) {
      const { files, gain } = raw as { files?: unknown; gain?: unknown };
      const list = typeof files === 'string' ? [files] : Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : [];
      if (list.length > 0) out[id] = { files: list, ...(typeof gain === 'number' ? { gain } : {}) };
    }
  }
  return out;
}

export function parseSoundManifest(json: unknown): SoundManifest {
  const data = (json ?? {}) as { sfx?: unknown; bgm?: unknown; tags?: unknown; rooms?: unknown };
  return { sfx: entryRecord(data.sfx), bgm: entryRecord(data.bgm), ...tagRecord(data.tags), rooms: stringRecord(data.rooms) };
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

/**
 * Loads sounds when they're wanted, each once, a few at a time (D-049) — so
 * nothing about sound holds up the title, and music the player hasn't
 * reached isn't downloaded at the start. A sound not loaded yet is silent
 * (an effect) or starts once it arrives (music: the engine plays the wanted
 * track as soon as it decodes).
 */
export interface SoundLoader {
  /** Starts loading `id` (an effect or a track) unless it's loaded or on its way. */
  ensure(id: string): void;
  /** Starts loading every sound effect. */
  loadAllSfx(): void;
  /** Starts loading every track. */
  loadAllBgm(): void;
}

export function createSoundLoader(audio: AudioEngine, manifest: SoundManifest, baseUrl: string, maxAtOnce = 4): SoundLoader {
  const requested = new Set<string>();
  const waiting: string[] = [];
  let inFlight = 0;
  const pump = () => {
    while (inFlight < maxAtOnce && waiting.length > 0) {
      const id = waiting.shift() as string;
      const entry = manifest.bgm[id] ?? manifest.sfx[id];
      if (!entry) continue;
      inFlight++;
      void audio
        .load(id, entry.files.map((file) => baseUrl + file), entry.gain !== undefined ? { gain: entry.gain } : {})
        .finally(() => {
          inFlight--;
          pump();
        });
    }
  };
  const ensure = (id: string, first = false) => {
    if (requested.has(id) || audio.has(id) || (!manifest.bgm[id] && !manifest.sfx[id])) return;
    requested.add(id);
    // A track asked for now goes ahead of the background queue.
    if (first) waiting.unshift(id);
    else waiting.push(id);
    pump();
  };
  return {
    ensure: (id) => ensure(id, true),
    loadAllSfx: () => Object.keys(manifest.sfx).forEach((id) => ensure(id)),
    loadAllBgm: () => Object.keys(manifest.bgm).forEach((id) => ensure(id)),
  };
}
