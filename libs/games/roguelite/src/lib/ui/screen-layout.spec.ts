import { describe, expect, it } from 'vitest';
import { cameraZoomFor } from '../camera.js';
import { screenLayout } from './screen-layout.js';

describe('screen layout (D-026, D-028)', () => {
  it('landscape centers an integer-scaled 480x270 box; the rest is margin', () => {
    // 844x390 phone at 3x = 2532x1170 device px -> 4x = 1920x1080 device px = 640x360 CSS px.
    expect(screenLayout(844, 390, 3)).toEqual({ kind: 'landscape', game: { left: 102, top: 15, width: 640, height: 360 } });
    expect(screenLayout(1920, 1080, 1)).toEqual({ kind: 'landscape', game: { left: 0, top: 0, width: 1920, height: 1080 } });
    expect(screenLayout(1300, 760, 1)).toEqual({ kind: 'landscape', game: { left: 170, top: 110, width: 960, height: 540 } });
  });

  it('portrait puts the box at the top, centered', () => {
    // iPhone 390 CSS px at 3x = 1170 device px -> 2x = 960 device px = 320 CSS px.
    expect(screenLayout(390, 844, 3)).toEqual({ kind: 'portrait', game: { left: 35, top: 0, width: 320, height: 180 } });
    expect(screenLayout(1000, 1200, 1)).toEqual({ kind: 'portrait', game: { left: 20, top: 0, width: 960, height: 540 } });
  });

  it('a screen under 480 device px wide scales the view down to its full width', () => {
    expect(screenLayout(320, 600, 1)).toEqual({ kind: 'portrait', game: { left: 0, top: 0, width: 320, height: 180 } });
  });
});

describe('camera zoom', () => {
  it('is the largest integer scale that fits 480x270 in device px', () => {
    expect(cameraZoomFor({ width: 1920, height: 1080 })).toBe(4);
    expect(cameraZoomFor({ width: 960, height: 540 })).toBe(2);
    expect(cameraZoomFor({ width: 1280, height: 720 })).toBe(2);
  });

  it('tolerates the browser rounding the box a pixel short', () => {
    expect(cameraZoomFor({ width: 959, height: 539 })).toBe(2);
  });

  it('below 480x270 it scales down so the whole view still shows', () => {
    expect(cameraZoomFor({ width: 320, height: 180 })).toBeCloseTo(2 / 3);
  });
});
