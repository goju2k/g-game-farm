/**
 * Where the game view goes on screen (D-046): everywhere. The canvas fills
 * the whole screen in every orientation — the camera shows more world on the
 * long axis (camera.ts) instead of leaving margins — and every piece of UI
 * (stick, buttons, dialogue, combo, pause, hints) floats over it.
 * `kind` still tells upright from sideways, for what a layout wants to know
 * (the camera holds the player a little higher when upright).
 */
export interface ScreenLayout {
  readonly kind: 'landscape' | 'portrait';
  /** Game box in CSS px — the whole screen. */
  readonly game: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

export function screenLayout(cssWidth: number, cssHeight: number): ScreenLayout {
  return { kind: cssHeight > cssWidth ? 'portrait' : 'landscape', game: { left: 0, top: 0, width: cssWidth, height: cssHeight } };
}
