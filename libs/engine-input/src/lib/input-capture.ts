import { buildInputFrame, type RawInputState } from './frame-builder.js';
import { createGamepadCapture } from './gamepad-capture.js';
import { createKeyboardCapture } from './keyboard-capture.js';
import { createMouseCapture } from './mouse-capture.js';
import { EMPTY_INPUT_FRAME, type InputFrame } from './types.js';

export interface InputCaptureOptions {
  readonly target: HTMLElement;
}

export interface InputCapture {
  /**
   * Reads the current physical device state and diffs it against the
   * previous poll to produce edges. Must be called exactly once per host
   * frame, right before `engine.tick()` — see frame-builder.ts's doc
   * comment on why calling this more than once per real frame (e.g. once
   * per fixed sub-step) would make edges depend on how many sub-steps ran.
   */
  poll(): InputFrame;
  /** While disabled, poll() returns EMPTY_INPUT_FRAME (e.g. while a React text input has focus) — devices are still tracked in the background. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

export function createInputCapture({ target }: InputCaptureOptions): InputCapture {
  const keyboard = createKeyboardCapture();
  const mouse = createMouseCapture({ target });
  const gamepad = createGamepadCapture();

  let enabled = true;
  let previous: RawInputState | undefined;

  return {
    poll(): InputFrame {
      if (!enabled) {
        return EMPTY_INPUT_FRAME;
      }
      const current: RawInputState = {
        keyboard: keyboard.getState(),
        mouse: mouse.getState(),
        gamepads: gamepad.getState().gamepads,
      };
      const frame = buildInputFrame(current, previous);
      previous = current;
      return frame;
    },
    setEnabled(next: boolean): void {
      enabled = next;
      // Re-enabling starts fresh so stale edges from before the gap don't leak through.
      previous = undefined;
    },
    dispose(): void {
      keyboard.dispose();
      mouse.dispose();
    },
  };
}
