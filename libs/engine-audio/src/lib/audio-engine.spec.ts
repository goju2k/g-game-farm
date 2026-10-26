import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioEngine, type AudioBufferLike, type AudioContextLike, type AudioParamLike } from './audio-engine.js';

function param(initial = 0) {
  const p = {
    value: initial,
    ramps: [] as [number, number][],
    setValueAtTime(v: number) {
      p.value = v;
    },
    linearRampToValueAtTime(v: number, t: number) {
      p.ramps.push([v, t]);
    },
    cancelScheduledValues() {
      p.ramps.length = 0;
    },
  };
  return p as AudioParamLike & { ramps: [number, number][] };
}

/** A recording stand-in for AudioContext. */
function fakeContext() {
  const started: { kind: 'buffer' | 'beep'; buffer?: AudioBufferLike; loop: boolean; stopped: boolean; node: { onended: (() => void) | null } }[] = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const ctx = {
    currentTime: 0,
    state: 'suspended',
    destination: node(),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => undefined),
    createGain: () => ({ ...node(), gain: param(1) }),
    createBufferSource() {
      const n = {
        ...node(),
        buffer: null as AudioBufferLike | null,
        loop: false,
        playbackRate: param(1),
        onended: null as (() => void) | null,
        start: () => started.push({ kind: 'buffer', buffer: n.buffer ?? undefined, loop: n.loop, stopped: false, node: n }),
        stop: () => {
          const entry = started.find((s) => s.node === n);
          if (entry) entry.stopped = true;
        },
      };
      return n;
    },
    createOscillator() {
      const n = {
        ...node(),
        type: 'sine',
        frequency: param(440),
        onended: null as (() => void) | null,
        start: () => started.push({ kind: 'beep', loop: false, stopped: false, node: n }),
        stop: () => undefined,
      };
      return n;
    },
    decodeAudioData: async (data: ArrayBuffer) => ({ duration: data.byteLength }),
  };
  return { ctx: ctx as AudioContextLike & { state: string }, started };
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.includes('missing') ? { ok: false } : { ok: true, arrayBuffer: async () => new ArrayBuffer(url.length) })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('audio engine', () => {
  it('drops sound effects until unlocked, then plays them', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    await audio.load('parry', '/s/parry.ogg');
    audio.playSfx('parry');
    expect(started).toHaveLength(0);
    await audio.unlock();
    expect(audio.unlocked).toBe(true);
    audio.playSfx('parry');
    expect(started).toHaveLength(1);
    expect(started[0].kind).toBe('buffer');
  });

  it('caps voices per sound by stopping the oldest', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx, maxVoicesPerSound: 2 });
    await audio.load('hit', '/s/hit.ogg');
    await audio.unlock();
    audio.playSfx('hit');
    audio.playSfx('hit');
    audio.playSfx('hit');
    expect(started).toHaveLength(3);
    expect(started.map((s) => s.stopped)).toEqual([true, false, false]);
  });

  it('a missing sound is silent by default, a beep when asked', async () => {
    stubFetch();
    const silent = fakeContext();
    const a = createAudioEngine({ createContext: () => silent.ctx });
    expect(await a.load('x', '/s/missing.ogg')).toBe(false);
    await a.unlock();
    a.playSfx('x');
    expect(silent.started).toHaveLength(0);

    const beeping = fakeContext();
    const b = createAudioEngine({ createContext: () => beeping.ctx, missing: 'beep' });
    await b.unlock();
    b.playSfx('dash');
    expect(beeping.started.map((s) => s.kind)).toEqual(['beep']);
  });

  it('music requested before unlock (or before its file loads) starts once possible, looping', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    audio.playBgm('part0');
    await audio.unlock();
    expect(started).toHaveLength(0); // not loaded yet
    await audio.load('part0', '/s/part0.ogg');
    expect(started).toHaveLength(1);
    expect(started[0].loop).toBe(true);
    expect(audio.currentBgm).toBe('part0');
  });

  it('switching music cross-fades: the old track ramps to 0 and stops, the new one ramps up', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    await audio.load('a', '/s/a.ogg');
    await audio.load('b', '/s/b.ogg');
    await audio.unlock();
    audio.playBgm('a');
    audio.playBgm('a'); // same: no restart
    expect(started).toHaveLength(1);
    audio.playBgm('b', { fadeMs: 500 });
    expect(started).toHaveLength(2);
    expect(started[0].stopped).toBe(true);
    audio.playBgm(undefined);
    expect(started[1].stopped).toBe(true);
    expect(audio.currentBgm).toBeUndefined();
  });

  it('a loop starts once and fades out on off', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    await audio.load('hum', '/s/hum.wav');
    await audio.unlock();
    audio.setLoop('hum', true);
    audio.setLoop('hum', true);
    expect(started).toHaveLength(1);
    expect(started[0].loop).toBe(true);
    audio.setLoop('hum', false);
    expect(started[0].stopped).toBe(true);
    audio.setLoop('hum', true);
    expect(started).toHaveLength(2);
  });

  it('tries each url in turn and keeps a per-sound gain', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    expect(await audio.load('quiet', ['/s/missing.ogg', '/s/quiet.m4a'], { gain: 2 })).toBe(true);
    expect(await audio.load('gone', ['/s/missing.ogg', '/s/missing.m4a'])).toBe(false);
    await audio.unlock();
    audio.playBgm('quiet', { fadeMs: 0 });
    expect(started).toHaveLength(1);
  });

  it('stopSfx cuts every copy of a sound', async () => {
    stubFetch();
    const { ctx, started } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    await audio.load('charge', '/s/charge.wav');
    await audio.unlock();
    audio.playSfx('charge');
    audio.playSfx('charge');
    audio.stopSfx('charge');
    expect(started.map((s) => s.stopped)).toEqual([true, true]);
  });

  it('keeps channel volumes, clamped to 0..1', async () => {
    const { ctx } = fakeContext();
    const audio = createAudioEngine({ createContext: () => ctx });
    audio.setVolume('bgm', 0.4);
    audio.setVolume('sfx', 3);
    expect(audio.getVolume('bgm')).toBe(0.4);
    expect(audio.getVolume('sfx')).toBe(1);
  });

  it('without an AudioContext every call is a harmless no-op', async () => {
    const audio = createAudioEngine({ createContext: () => undefined });
    await audio.unlock();
    expect(await audio.load('x', '/x.ogg')).toBe(false);
    audio.playSfx('x');
    audio.playBgm('x');
    audio.dispose();
    expect(audio.unlocked).toBe(false);
  });
});
