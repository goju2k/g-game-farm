// @vitest-environment jsdom
import { loadTextures } from './load-textures.js';
import type { EngineRenderer, ImageSource, TextureHandle, TextureOptions } from './types.js';

// jsdom doesn't implement HTMLImageElement.decode() at all — stub it so
// `new Image()` + `.decode()` resolves immediately, same as a real browser
// once the image has loaded. We don't need real pixel data here, only that
// the returned element gets passed through to createTexture correctly.
beforeEach(() => {
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
});

function makeFakeRenderer() {
  let nextHandle = 0;
  const createTexture = vi.fn((_source: ImageSource, _options: TextureOptions) => (nextHandle++ as unknown) as TextureHandle);
  return { createTexture } as unknown as EngineRenderer & { createTexture: typeof createTexture };
}

describe('loadTextures', () => {
  it('creates one texture per manifest entry, keyed the same as the manifest', async () => {
    const renderer = makeFakeRenderer();
    const manifest = { player: 'characters/player.png', tiles: 'map/tiles.png' } as const;

    const result = await loadTextures(renderer, manifest, '/game/');

    expect(Object.keys(result)).toEqual(['player', 'tiles']);
    expect(renderer.createTexture).toHaveBeenCalledTimes(2);
  });

  it('prefixes each manifest path with baseUrl when setting img.src', async () => {
    const renderer = makeFakeRenderer();
    const seenSrcs: string[] = [];
    renderer.createTexture.mockImplementation((source) => {
      seenSrcs.push((source as HTMLImageElement).src);
      return 0 as unknown as TextureHandle;
    });

    await loadTextures(renderer, { player: 'characters/player.png' } as const, '/game/');

    expect(seenSrcs[0]).toMatch(/\/game\/characters\/player\.png$/);
  });

  it('defaults to nearest filtering', async () => {
    const renderer = makeFakeRenderer();

    await loadTextures(renderer, { player: 'p.png' } as const, '/game/');

    expect(renderer.createTexture).toHaveBeenCalledWith(expect.anything(), { filter: 'nearest' });
  });

  it('honors an explicit linear filter option', async () => {
    const renderer = makeFakeRenderer();

    await loadTextures(renderer, { bg: 'bg.png' } as const, '/game/', { filter: 'linear' });

    expect(renderer.createTexture).toHaveBeenCalledWith(expect.anything(), { filter: 'linear' });
  });

  it('returns the exact TextureHandle values createTexture produced', async () => {
    const renderer = makeFakeRenderer();

    const result = await loadTextures(renderer, { a: 'a.png', b: 'b.png' } as const, '/game/');

    expect(result.a).toBe(0);
    expect(result.b).toBe(1);
  });
});
