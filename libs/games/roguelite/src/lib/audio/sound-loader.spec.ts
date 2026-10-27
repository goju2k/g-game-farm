import type { AudioEngine } from '@g-game-farm/ribs';
import { createSoundLoader, parseSoundManifest } from './sound-manifest.js';

/** A fake engine: records load order; each load resolves when the test says. */
function fakeAudio() {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const audio = {
    has: () => false,
    load: (id: string) => {
      started.push(id);
      return new Promise<boolean>((resolve) => finish.set(id, () => resolve(true)));
    },
  } as unknown as AudioEngine;
  return { audio, started, finish: (id: string) => finish.get(id)?.() };
}

const manifest = parseSoundManifest({
  sfx: { a: 'a.ogg', b: 'b.ogg', c: 'c.ogg', d: 'd.ogg', e: 'e.ogg' },
  bgm: { 'bgm-part0': 'p0.ogg', 'bgm-part1': 'p1.ogg', 'bgm-boss': 'boss.ogg' },
});

describe('sound loading (D-049)', () => {
  it('loads a few at a time; a track asked for jumps the queue; nothing loads twice', async () => {
    const t = fakeAudio();
    const loader = createSoundLoader(t.audio, manifest, '/', 2);
    loader.loadAllSfx();
    expect(t.started).toEqual(['a', 'b']); // two at once
    loader.ensure('bgm-part1'); // a room asks for its music
    loader.ensure('a');
    t.finish('a');
    await Promise.resolve();
    await Promise.resolve();
    expect(t.started).toEqual(['a', 'b', 'bgm-part1']);
    loader.loadAllBgm();
    expect(t.started.filter((id) => id === 'bgm-part1')).toHaveLength(1);
  });

  it('the music the player has not reached is not fetched at the start', () => {
    const t = fakeAudio();
    const loader = createSoundLoader(t.audio, manifest, '/', 8);
    loader.loadAllSfx();
    loader.ensure('bgm-part0');
    expect(t.started).toContain('bgm-part0');
    expect(t.started).not.toContain('bgm-part1');
    expect(t.started).not.toContain('bgm-boss');
  });
});
