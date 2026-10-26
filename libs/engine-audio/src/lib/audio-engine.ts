/**
 * The engine's sound: background music (looping, cross-faded) and sound
 * effects (many at once, a few voices per sound), each with its own volume.
 * Plain WebAudio — no ECS here; a game queues cues from its simulation and
 * plays them from a render system.
 *
 * Browsers start audio suspended until a user gesture: call unlock() from
 * one (a "start" tap). Until then cues are dropped, except the latest bgm
 * request, which starts once unlocked.
 *
 * Platform-free: the engine never creates an AudioContext itself — the host
 * (apps/*, the playground) injects `createContext` (platform abstraction,
 * CLAUDE.md). Without one, every call is a no-op.
 *
 * A sound that was never loaded (or failed to load) is silent — or a short
 * beep with `missing: 'beep'`, for checking the wiring before real files exist.
 */

export type AudioChannel = 'bgm' | 'sfx';

export interface AudioEngineOptions {
  /** Creates the AudioContext (injected by the host). Omitted or returning undefined: every call is a no-op. */
  readonly createContext?: () => AudioContextLike | undefined;
  /** At most this many copies of one sound play at once; a new one stops the oldest. Default 4. */
  readonly maxVoicesPerSound?: number;
  /** What an unloaded sound effect plays. Default 'silent'. */
  readonly missing?: 'silent' | 'beep';
}

export interface SfxOptions {
  /** 0..1, on top of the sfx channel volume. Default 1. */
  readonly volume?: number;
  /** Playback rate (pitch). Default 1. */
  readonly rate?: number;
}

export interface BgmOptions {
  /** Cross-fade length. Default 800ms. */
  readonly fadeMs?: number;
  /** 0..1, on top of the bgm channel volume. Default 1. */
  readonly volume?: number;
}

export interface AudioEngine {
  /** Resume audio — call from a user gesture (tap / click / key). Safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  /** Fetch + decode a sound under `id`. Failure leaves it missing (silent / beep) and resolves false. */
  load(id: string, url: string): Promise<boolean>;
  has(id: string): boolean;
  playSfx(id: string, options?: SfxOptions): void;
  /** Start (on) or fade out (off) a looping sound effect on the sfx channel — e.g. a hum while moving. Same state again: no-op. */
  setLoop(id: string, on: boolean, options?: { readonly fadeMs?: number; readonly volume?: number }): void;
  /** Fade out every loop (the game paused). */
  stopLoops(): void;
  /** Switch the music to `id` (looping), cross-fading; undefined fades it out. Same id again: no-op. */
  playBgm(id: string | undefined, options?: BgmOptions): void;
  readonly currentBgm: string | undefined;
  setVolume(channel: AudioChannel, volume: number): void;
  getVolume(channel: AudioChannel): number;
  dispose(): void;
}

// ---- the slice of WebAudio this uses (so tests can pass a fake) ----

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}
export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}
export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}
export interface AudioBufferLike {
  readonly duration: number;
}
export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  readonly playbackRate: AudioParamLike;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createOscillator(): OscillatorNodeLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
}

const DEFAULT_FADE_MS = 800;
const BEEP_SECONDS = 0.06;

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const maxVoices = Math.max(1, options.maxVoicesPerSound ?? 4);
  const missing = options.missing ?? 'silent';
  let context: AudioContextLike | undefined;
  let channels: Record<AudioChannel, GainNodeLike> | undefined;
  const volumes: Record<AudioChannel, number> = { bgm: 1, sfx: 1 };
  const buffers = new Map<string, AudioBufferLike>();
  const voices = new Map<string, { source: { stop(when?: number): void }; gain: GainNodeLike }[]>();
  let bgm: { id: string; source: AudioBufferSourceNodeLike; gain: GainNodeLike; volume: number } | undefined;
  const loops = new Map<string, { source: AudioBufferSourceNodeLike; gain: GainNodeLike }>();
  /** The music asked for — may not be playing yet (locked, or its file still loading). */
  let wantedBgm: { id: string | undefined; options: BgmOptions } = { id: undefined, options: {} };
  let unlocked = false;
  let disposed = false;

  // Created lazily: some browsers warn about a context made before a gesture.
  const ensure = (): AudioContextLike | undefined => {
    if (context || disposed) return context;
    try {
      context = options.createContext?.();
    } catch {
      context = undefined;
    }
    const created = context;
    if (!created) return undefined;
    const make = (channel: AudioChannel) => {
      const gain = created.createGain();
      gain.gain.value = volumes[channel];
      gain.connect(created.destination);
      return gain;
    };
    channels = { bgm: make('bgm'), sfx: make('sfx') };
    return created;
  };

  const ready = () => (unlocked && !disposed ? ensure() : undefined);

  const stopBgmNow = (fadeMs: number) => {
    const ctx = context;
    if (!bgm || !ctx) return;
    const { source, gain } = bgm;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    source.onended = () => gain.disconnect();
    source.stop(now + fadeMs / 1000 + 0.05);
    bgm = undefined;
  };

  const startWantedBgm = () => {
    const ctx = ready();
    const { id, options: bgmOptions } = wantedBgm;
    if (!ctx || !channels) return;
    if (bgm?.id === id) return;
    const fadeMs = bgmOptions.fadeMs ?? DEFAULT_FADE_MS;
    stopBgmNow(fadeMs);
    const buffer = id !== undefined ? buffers.get(id) : undefined;
    if (id === undefined || !buffer) return; // silence (or not loaded yet — load() retries)
    const gain = ctx.createGain();
    const volume = clamp01(bgmOptions.volume ?? 1);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + fadeMs / 1000);
    gain.connect(channels.bgm);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(now);
    bgm = { id, source, gain, volume };
  };

  return {
    async unlock() {
      const ctx = ensure();
      if (!ctx) return;
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch {
        return;
      }
      if (disposed) return;
      unlocked = true;
      startWantedBgm();
    },
    get unlocked() {
      return unlocked;
    },
    async load(id, url) {
      const ctx = ensure();
      if (!ctx) return false;
      try {
        const response = await fetch(url);
        if (!response.ok) return false;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (disposed) return false;
        buffers.set(id, buffer);
        if (wantedBgm.id === id) startWantedBgm();
        return true;
      } catch {
        return false;
      }
    },
    has: (id) => buffers.has(id),
    playSfx(id, sfxOptions = {}) {
      const ctx = ready();
      if (!ctx || !channels) return;
      const buffer = buffers.get(id);
      if (!buffer && missing === 'silent') return;
      const list = voices.get(id) ?? [];
      while (list.length >= maxVoices) {
        const oldest = list.shift();
        if (!oldest) break;
        try {
          oldest.source.stop();
        } catch {
          // already stopped
        }
        oldest.gain.disconnect();
      }
      const gain = ctx.createGain();
      gain.gain.value = clamp01(sfxOptions.volume ?? 1) * (buffer ? 1 : 0.15);
      gain.connect(channels.sfx);
      const now = ctx.currentTime;
      let source: AudioBufferSourceNodeLike | OscillatorNodeLike;
      if (buffer) {
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.playbackRate.value = sfxOptions.rate ?? 1;
        source = node;
      } else {
        // Placeholder: a short square blip, pitched per id so different cues are tell-apart-able.
        const node = ctx.createOscillator();
        node.type = 'square';
        let hash = 0;
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
        node.frequency.value = 330 + (hash % 12) * 55;
        source = node;
      }
      const voice = { source, gain };
      source.onended = () => {
        gain.disconnect();
        const current = voices.get(id);
        const index = current ? current.indexOf(voice) : -1;
        if (current && index >= 0) current.splice(index, 1);
      };
      source.connect(gain);
      source.start(now);
      if (!buffer) source.stop(now + BEEP_SECONDS);
      list.push(voice);
      voices.set(id, list);
    },
    setLoop(id, on, loopOptions = {}) {
      const ctx = ready();
      if (!ctx || !channels) return;
      const fade = (loopOptions.fadeMs ?? 120) / 1000;
      const now = ctx.currentTime;
      const playing = loops.get(id);
      if (!on) {
        if (!playing) return;
        loops.delete(id);
        playing.gain.gain.cancelScheduledValues(now);
        playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
        playing.gain.gain.linearRampToValueAtTime(0, now + fade);
        playing.source.onended = () => playing.gain.disconnect();
        playing.source.stop(now + fade + 0.05);
        return;
      }
      const buffer = buffers.get(id);
      if (playing || !buffer) return;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(clamp01(loopOptions.volume ?? 1), now + fade);
      gain.connect(channels.sfx);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(now);
      loops.set(id, { source, gain });
    },
    stopLoops() {
      for (const id of [...loops.keys()]) this.setLoop(id, false);
    },
    playBgm(id, bgmOptions = {}) {
      if (wantedBgm.id === id) return;
      wantedBgm = { id, options: bgmOptions };
      startWantedBgm();
    },
    get currentBgm() {
      return wantedBgm.id;
    },
    setVolume(channel, volume) {
      volumes[channel] = clamp01(volume);
      if (channels && context) {
        const param = channels[channel].gain;
        param.cancelScheduledValues(context.currentTime);
        param.setValueAtTime(volumes[channel], context.currentTime);
        param.value = volumes[channel];
      }
    },
    getVolume: (channel) => volumes[channel],
    dispose() {
      if (disposed) return;
      disposed = true;
      bgm = undefined;
      voices.clear();
      loops.clear();
      void context?.close().catch(() => undefined);
    },
  };
}
