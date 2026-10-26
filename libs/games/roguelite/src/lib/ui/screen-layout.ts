import { ROGUELITE_VIEW } from '../camera.js';

/**
 * Where the game view goes on screen (touch spec §7, D-026).
 *
 * Landscape: the game fills the screen (controls float over it).
 * Portrait (taller than wide — a phone held upright, or a tall PC window):
 * Game Boy style — the 480×270 view at the largest integer scale of device
 * pixels that fits the width, top-aligned and centered; everything below is
 * the control area.
 */
export type ScreenLayout =
  | { readonly kind: 'landscape' }
  | {
      readonly kind: 'portrait';
      /** Game box in CSS px. */ readonly game: {
        readonly left: number;
        readonly width: number;
        readonly height: number;
      };
    };

export function screenLayout(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): ScreenLayout {
  if (cssHeight <= cssWidth || cssWidth <= 0) return { kind: 'landscape' };
  const scale = Math.floor((cssWidth * dpr) / ROGUELITE_VIEW.width);
  // Narrower than 480 device px: no integer scale fits, use the full width.
  const width = scale >= 1 ? (scale * ROGUELITE_VIEW.width) / dpr : cssWidth;
  const height = (width * ROGUELITE_VIEW.height) / ROGUELITE_VIEW.width;
  return {
    kind: 'portrait',
    game: { left: (cssWidth - width) / 2, width, height },
  };
}
