import { describe, expect, it } from 'vitest';
import { cameraZoomFor } from '../camera.js';
import { screenLayout } from './screen-layout.js';

describe('screen layout (D-026)', () => {
  it('landscape keeps the full-screen game', () => {
    expect(screenLayout(844, 390, 3)).toEqual({ kind: 'landscape' });
    expect(screenLayout(1920, 1080, 1)).toEqual({ kind: 'landscape' });
  });

  it('portrait puts an integer-scaled 480x270 box at the top, centered', () => {
    // iPhone 390 CSS px at 3x = 1170 device px -> 2x = 960 device px = 320 CSS px.
    expect(screenLayout(390, 844, 3)).toEqual({
      kind: 'portrait',
      game: { left: 35, width: 320, height: 180 },
    });
    // A tall PC window at 1x: 1000 px -> 2x.
    expect(screenLayout(1000, 1200, 1)).toEqual({
      kind: 'portrait',
      game: { left: 20, width: 960, height: 540 },
    });
  });

  it('a screen under 480 device px wide uses its full width', () => {
    expect(screenLayout(320, 600, 1)).toEqual({
      kind: 'portrait',
      game: { left: 0, width: 320, height: 180 },
    });
  });
});

describe('camera zoom', () => {
  it('is the largest integer scale that fits 480x270 in device px', () => {
    expect(cameraZoomFor({ width: 1920, height: 1080 })).toBe(4);
    expect(cameraZoomFor({ width: 960, height: 540 })).toBe(2);
    expect(cameraZoomFor({ width: 2532, height: 1170 })).toBe(4);
    expect(cameraZoomFor({ width: 1280, height: 720 })).toBe(2);
  });

  it('tolerates the browser rounding the box a pixel short, and never drops below 1', () => {
    expect(cameraZoomFor({ width: 959, height: 539 })).toBe(2);
    expect(cameraZoomFor({ width: 320, height: 180 })).toBe(1);
  });
});
