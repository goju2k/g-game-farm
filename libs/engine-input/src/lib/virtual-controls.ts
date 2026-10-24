import type { DigitalState, VirtualFrame } from './types.js';

/**
 * The state behind InputFrame.virtual, written by host UI (DOM pointer
 * handlers) and read once per poll. Presses and releases are latched until
 * the next poll, so a tap that goes down and up between two frames still
 * shows up as justPressed (and justReleased) exactly once — a touch button
 * can't be "too quick" for the game.
 */
export interface VirtualControls {
  press(button: string): void;
  release(button: string): void;
  setAxis(axis: string, value: number): void;
  /** World-space aim, or undefined to clear it. */
  setAim(aim: Readonly<{ x: number; y: number }> | undefined): void;
  /** Releases everything and zeroes all axes (e.g. when the controls hide). */
  reset(): void;
  /** The frame since the last poll; clears the latched edges. Called by InputCapture. */
  poll(): VirtualFrame;
}

export function createVirtualControls(): VirtualControls {
  const held = new Set<string>();
  let pressed = new Set<string>();
  let released = new Set<string>();
  const axes: Record<string, number> = {};
  let aim: Readonly<{ x: number; y: number }> | undefined;

  return {
    press(button) {
      if (!held.has(button)) {
        held.add(button);
        pressed.add(button);
      }
    },
    release(button) {
      if (held.delete(button)) {
        released.add(button);
      }
    },
    setAxis(axis, value) {
      axes[axis] = value;
    },
    setAim(next) {
      aim = next;
    },
    reset() {
      for (const button of held) released.add(button);
      held.clear();
      for (const axis of Object.keys(axes)) axes[axis] = 0;
      aim = undefined;
    },
    poll(): VirtualFrame {
      const buttons: DigitalState<string> = { held: new Set(held), justPressed: pressed, justReleased: released };
      pressed = new Set();
      released = new Set();
      return { buttons, axes: { ...axes }, aim };
    },
  };
}
