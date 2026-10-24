import { describe, expect, it } from 'vitest';
import { GrowableFloat32Buffer } from './batching.js';
import { bandIntensityAt, LIGHT_FLOATS_PER_VERTEX, pushLightQuad, tintedLight, validateLightingSettings } from './lighting.js';
import { NullRenderer } from './null-renderer.js';
import type { LightingSettings } from './types.js';

const STEPPED: LightingSettings = {
  ambient: [0.3, 0.3, 0.33],
  bands: [
    { until: 0.4, intensity: 1 },
    { until: 0.7, intensity: 0.75 },
    { until: 1, intensity: 0.55 },
  ],
};

describe('validateLightingSettings', () => {
  it('accepts a well-formed stepped falloff with emissive colors', () => {
    expect(() => validateLightingSettings({ ...STEPPED, emissive: [[223, 113, 38]] })).not.toThrow();
  });

  it.each([
    ['ambient out of range', { ...STEPPED, ambient: [0.3, 1.2, 0.3] }, /ambient/],
    ['no bands', { ...STEPPED, bands: [] }, /1\.\.4 bands/],
    ['too many bands', { ...STEPPED, bands: [0.2, 0.4, 0.6, 0.8, 1].map((until) => ({ until, intensity: 1 })) }, /1\.\.4 bands/],
    ['bands out of order', { ...STEPPED, bands: [{ until: 0.7, intensity: 1 }, { until: 0.4, intensity: 1 }] }, /inner to outer/],
    ['band past the radius', { ...STEPPED, bands: [{ until: 1.2, intensity: 1 }] }, /<= 1/],
    ['intensity out of range', { ...STEPPED, bands: [{ until: 1, intensity: 2 }] }, /intensity/],
    ['fractional emissive color', { ...STEPPED, emissive: [[0.5, 0.2, 0.1]] }, /0\.\.255/],
  ] as const)('rejects %s', (_, settings, error) => {
    expect(() => validateLightingSettings(settings as LightingSettings)).toThrow(error);
  });
});

describe('bandIntensityAt', () => {
  it('steps through the bands, inclusive at each edge, dark past the last', () => {
    expect(bandIntensityAt(STEPPED.bands, 0)).toBe(1);
    expect(bandIntensityAt(STEPPED.bands, 0.4)).toBe(1);
    expect(bandIntensityAt(STEPPED.bands, 0.41)).toBe(0.75);
    expect(bandIntensityAt(STEPPED.bands, 0.7)).toBe(0.75);
    expect(bandIntensityAt(STEPPED.bands, 0.9)).toBe(0.55);
    expect(bandIntensityAt(STEPPED.bands, 1.01)).toBe(0);
  });
});

describe('tintedLight', () => {
  it('is neutral with no tint and pushes channels by L·(1 + k·L) otherwise', () => {
    expect(tintedLight([0, 0, 0], 0.75)).toEqual([0.75, 0.75, 0.75]);
    const warm = tintedLight([0.35, 0.12, -0.25], 1);
    expect(warm[0]).toBeCloseTo(1.35);
    expect(warm[1]).toBeCloseTo(1.12);
    expect(warm[2]).toBeCloseTo(0.75);
  });

  it('caps at 2, the most the half-scale light map can hold', () => {
    expect(tintedLight([5, 0, 0], 1)[0]).toBe(2);
  });
});

describe('pushLightQuad', () => {
  it('covers the squashed ellipse bounds with two triangles carrying the light center/radius/tint', () => {
    const out = new GrowableFloat32Buffer(0);
    pushLightQuad(out, { layer: 'l', x: 100, y: 50, radius: 40, squashY: 0.75, tint: [0.35, 0.12, -0.25] });
    const v = out.view();
    expect(v.length).toBe(6 * LIGHT_FLOATS_PER_VERTEX);
    const corners = Array.from({ length: 6 }, (_, i) => [v[i * 10], v[i * 10 + 1]]);
    expect(corners).toEqual([
      [60, 20],
      [140, 20],
      [60, 80],
      [140, 20],
      [140, 80],
      [60, 80],
    ]);
    expect(Array.from(v.subarray(3, 10))).toEqual([100, 50, 40, 0.75, expect.closeTo(0.35), expect.closeTo(0.12), -0.25]);
  });

  it('rejects a non-positive radius or squash', () => {
    const out = new GrowableFloat32Buffer(0);
    expect(() => pushLightQuad(out, { layer: 'l', x: 0, y: 0, radius: 0, tint: [0, 0, 0] })).toThrow(/positive/);
    expect(() => pushLightQuad(out, { layer: 'l', x: 0, y: 0, radius: 5, squashY: 0, tint: [0, 0, 0] })).toThrow(/positive/);
  });
});

describe('NullRenderer lighting', () => {
  it('validates settings like the real renderer', () => {
    const renderer = new NullRenderer();
    expect(() => renderer.setLighting(STEPPED)).not.toThrow();
    expect(() => renderer.setLighting({ ...STEPPED, bands: [] })).toThrow();
  });
});
