import type { RawGamepadState } from './frame-builder.js';

export interface GamepadCaptureState {
  readonly gamepads: readonly RawGamepadState[];
}

export interface GamepadCapture {
  getState(): GamepadCaptureState;
}

/**
 * No listeners, no `dispose()` — the Gamepad API has no press/release
 * events (only connect/disconnect), so unlike keyboard/mouse this reads
 * `navigator.getGamepads()` fresh on every call. That also means there's no
 * "stuck button" failure mode from a lost blur event: each poll reflects
 * reality regardless of what happened between polls.
 */
export function createGamepadCapture(): GamepadCapture {
  return {
    getState: () => {
      const gamepads: RawGamepadState[] = [];
      for (const pad of navigator.getGamepads()) {
        if (!pad?.connected) {
          continue;
        }
        const heldButtons = new Set<number>();
        const buttonValues: number[] = [];
        pad.buttons.forEach((button, index) => {
          if (button.pressed) {
            heldButtons.add(index);
          }
          buttonValues.push(button.value);
        });
        gamepads.push({ index: pad.index, id: pad.id, heldButtons, buttonValues, axes: [...pad.axes] });
      }
      return { gamepads };
    },
  };
}
