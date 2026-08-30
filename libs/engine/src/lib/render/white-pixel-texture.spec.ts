import { createWhitePixelTexture } from './white-pixel-texture.js';
import type { EngineRenderer, ImageSource, TextureHandle, TextureOptions } from './types.js';

// Neither Node nor jsdom (no optional `canvas` package installed) implement
// ImageData — a minimal polyfill matching the {data,width,height} shape the
// production code actually reads is enough; this test doesn't need any
// other Canvas 2D API behavior.
class FakeImageData {
  constructor(
    public readonly data: Uint8ClampedArray,
    public readonly width: number,
    public readonly height: number,
  ) {}
}

beforeAll(() => {
  vi.stubGlobal('ImageData', FakeImageData);
});

describe('createWhitePixelTexture', () => {
  it('creates a texture from a 1x1 opaque-white ImageData with nearest filtering', () => {
    const createTexture = vi.fn((_source: ImageSource, _options: TextureOptions) => 0 as unknown as TextureHandle);
    const renderer = { createTexture } as unknown as EngineRenderer;

    createWhitePixelTexture(renderer);

    expect(createTexture).toHaveBeenCalledTimes(1);
    const [source, options] = createTexture.mock.calls[0];
    const imageData = source as ImageData;
    expect(imageData.width).toBe(1);
    expect(imageData.height).toBe(1);
    expect([...imageData.data]).toEqual([255, 255, 255, 255]);
    expect(options).toEqual({ filter: 'nearest' });
  });

  it('returns the TextureHandle createTexture produced', () => {
    const handle = 7 as unknown as TextureHandle;
    const renderer = { createTexture: vi.fn(() => handle) } as unknown as EngineRenderer;

    expect(createWhitePixelTexture(renderer)).toBe(handle);
  });
});
