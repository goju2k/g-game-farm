import type { PhysicalKey } from './types.js';

export interface KeyboardCaptureState {
  readonly held: ReadonlySet<PhysicalKey>;
}

export interface KeyboardCapture {
  /** Snapshot copy of the currently-held keys — safe to hold onto after future key events. */
  getState(): KeyboardCaptureState;
  dispose(): void;
}

/**
 * Listens on `window` (not a specific element) — canvases aren't focusable
 * by default, and requiring a click before keyboard input works is exactly
 * the UX problem this avoids. `blur` force-clears held keys: without it, an
 * alt-tab away mid-keypress never delivers `keyup`, so the key would stay
 * "logically" held forever (the classic stuck-key browser game bug).
 *
 * No preventDefault() here (e.g. arrow keys scrolling the page) — deciding
 * which keys to suppress is a per-app/game concern, deliberately left out
 * of this thin capture layer for now.
 */
export function createKeyboardCapture(): KeyboardCapture {
  const held = new Set<PhysicalKey>();

  const onKeyDown = (event: KeyboardEvent) => {
    held.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  const onBlur = () => {
    held.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    getState: () => ({ held: new Set(held) }),
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
