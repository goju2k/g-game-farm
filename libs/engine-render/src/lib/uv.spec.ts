import { pixelRectToUv } from './uv.js';

const textureSize = { width: 64, height: 32 };

describe('pixelRectToUv', () => {
  it('normalizes a pixel sub-rect to 0..1 UV', () => {
    expect(pixelRectToUv(16, 8, 16, 8, textureSize)).toEqual({ u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 });
  });

  it('covers the whole texture when the rect matches its size', () => {
    expect(pixelRectToUv(0, 0, 64, 32, textureSize)).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
  });

  it('flipX swaps u0/u1 and leaves v untouched', () => {
    const base = pixelRectToUv(16, 8, 16, 8, textureSize);
    const flipped = pixelRectToUv(16, 8, 16, 8, textureSize, true);
    expect(flipped).toEqual({ u0: base.u1, v0: base.v0, u1: base.u0, v1: base.v1 });
  });

  it('flipY swaps v0/v1 and leaves u untouched', () => {
    const base = pixelRectToUv(16, 8, 16, 8, textureSize);
    const flipped = pixelRectToUv(16, 8, 16, 8, textureSize, false, true);
    expect(flipped).toEqual({ u0: base.u0, v0: base.v1, u1: base.u1, v1: base.v0 });
  });

  it('flipX and flipY together swap both axes', () => {
    const base = pixelRectToUv(16, 8, 16, 8, textureSize);
    const flipped = pixelRectToUv(16, 8, 16, 8, textureSize, true, true);
    expect(flipped).toEqual({ u0: base.u1, v0: base.v1, u1: base.u0, v1: base.v0 });
  });
});
