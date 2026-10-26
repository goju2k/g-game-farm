import { ROGUELITE_VIEW } from '../camera.js';

/**
 * Where the game view goes on screen (touch spec §7, D-026, D-028).
 *
 * Every screen shows exactly the 480×270 world view, at the largest integer
 * scale of device pixels that fits (crisp pixels); the rest is margin.
 * Landscape: the box is centered (touch controls float over it and the margin).
 * Portrait (taller than wide — a phone held upright, or a tall PC window):
 * Game Boy style — the box sits at the top, and everything below is the
 * control area.
 * A screen under 480×270 device px scales the view down to fit instead.
 */
export interface ScreenLayout {
  readonly kind: 'landscape' | 'portrait';
  /** Game box in CSS px. */
  readonly game: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

export function screenLayout(cssWidth: number, cssHeight: number, dpr: number): ScreenLayout {
  const portrait = cssHeight > cssWidth;
  const fit = Math.min(cssWidth / ROGUELITE_VIEW.width, cssHeight / ROGUELITE_VIEW.height); // CSS px per world unit
  const scale = Math.floor(fit * dpr); // integer device px per world unit
  const cssPerUnit = scale >= 1 ? scale / dpr : Math.max(fit, 0);
  const width = ROGUELITE_VIEW.width * cssPerUnit;
  const height = ROGUELITE_VIEW.height * cssPerUnit;
  return {
    kind: portrait ? 'portrait' : 'landscape',
    game: { left: (cssWidth - width) / 2, top: portrait ? 0 : (cssHeight - height) / 2, width, height },
  };
}
