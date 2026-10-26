import type { AudioEngine, RenderSystem } from '@g-game-farm/ribs';

/**
 * Sounds the simulation asked for. Simulation code never touches the audio
 * engine (it must run headless and replay deterministically) — it pushes
 * cues here, and the sound render system plays them once per frame. Lives
 * outside World (like the dialogue controller), so a frame that runs several
 * simulation steps, or none, still plays every cue exactly once.
 */
export type SoundCue =
  | { readonly kind: 'sfx'; readonly id: string; readonly volume?: number }
  | { readonly kind: 'bgm'; readonly id: string | undefined; readonly fadeMs?: number }
  | { readonly kind: 'loop'; readonly id: string; readonly on: boolean }
  | { readonly kind: 'stop'; readonly id: string };

export interface SoundQueue {
  /** Play sound effect `id` (data/sounds.json). */
  sfx(id: string, volume?: number): void;
  /** Switch the music to `id` (undefined: fade out). It keeps playing across rooms until changed. */
  bgm(id: string | undefined, fadeMs?: number): void;
  /** Start / stop a looping effect (a hum while moving). */
  loop(id: string, on: boolean): void;
  /** Cut a sound effect still playing (a sentinel's charge-up interrupted). */
  stop(id: string): void;
  /** Takes every queued cue, oldest first. */
  drain(): SoundCue[];
}

export function createSoundQueue(): SoundQueue {
  let cues: SoundCue[] = [];
  return {
    sfx: (id, volume) => void cues.push({ kind: 'sfx', id, ...(volume !== undefined ? { volume } : {}) }),
    bgm: (id, fadeMs) => void cues.push({ kind: 'bgm', id, ...(fadeMs !== undefined ? { fadeMs } : {}) }),
    loop: (id, on) => void cues.push({ kind: 'loop', id, on }),
    stop: (id) => void cues.push({ kind: 'stop', id }),
    drain() {
      const taken = cues;
      cues = [];
      return taken;
    },
  };
}

/** Render phase: hand the queued cues to the audio engine. */
export function createSoundSystem(queue: SoundQueue, audio: AudioEngine): RenderSystem {
  return {
    name: 'roguelite:sound',
    order: 100,
    run: () => {
      // A burst (a skipped scene runs to its end in one step) plays each sound once.
      const played = new Set<string>();
      for (const cue of queue.drain()) {
        if (cue.kind === 'bgm') {
          audio.playBgm(cue.id, cue.fadeMs !== undefined ? { fadeMs: cue.fadeMs } : {});
        } else if (cue.kind === 'loop') {
          audio.setLoop(cue.id, cue.on);
        } else if (cue.kind === 'stop') {
          audio.stopSfx(cue.id);
          played.delete(cue.id);
        } else if (!played.has(cue.id)) {
          played.add(cue.id);
          audio.playSfx(cue.id, cue.volume !== undefined ? { volume: cue.volume } : {});
        }
      }
    },
  };
}

/** Discards every cue — where nothing plays sound (headless tests, tools). */
export const NO_SOUND: SoundQueue = { sfx: () => undefined, bgm: () => undefined, loop: () => undefined, stop: () => undefined, drain: () => [] };
