import type { MouseButton } from './types.js';

export interface MouseCaptureState {
  readonly heldButtons: ReadonlySet<MouseButton>;
  readonly position: Readonly<{ x: number; y: number }> | undefined;
  readonly wheelDeltaY: number;
}

export interface MouseCaptureOptions {
  readonly target: HTMLElement;
}

export interface MouseCapture {
  /** Snapshot copy of current button/position state; also drains the accumulated wheel delta. */
  getState(): MouseCaptureState;
  dispose(): void;
}

const BUTTON_NAME_BY_INDEX: Readonly<Record<number, MouseButton>> = {
  0: 'left',
  1: 'middle',
  2: 'right',
  3: 'back',
  4: 'forward',
};

/**
 * `mousedown`/`wheel`/`contextmenu` (prevented, so right-click is usable as
 * a game input) listen on `target` — but `mousemove`/`mouseup` listen on
 * `window`, so dragging the mouse outside the canvas before releasing a
 * button (or moving back in) isn't missed. Position is target-local,
 * computed from `getBoundingClientRect()` and never clamped — being outside
 * the canvas bounds is valid information, not an error.
 */
export function createMouseCapture({ target }: MouseCaptureOptions): MouseCapture {
  const heldButtons = new Set<MouseButton>();
  let position: Readonly<{ x: number; y: number }> | undefined;
  let wheelDeltaY = 0;

  const updatePosition = (event: MouseEvent) => {
    const rect = target.getBoundingClientRect();
    position = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onMouseDown = (event: MouseEvent) => {
    const name = BUTTON_NAME_BY_INDEX[event.button];
    if (name) {
      heldButtons.add(name);
    }
  };
  const onMouseUp = (event: MouseEvent) => {
    const name = BUTTON_NAME_BY_INDEX[event.button];
    if (name) {
      heldButtons.delete(name);
    }
  };
  const onWheel = (event: WheelEvent) => {
    wheelDeltaY += event.deltaY;
  };
  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };
  const onBlur = () => {
    heldButtons.clear();
  };

  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('wheel', onWheel, { passive: true });
  target.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('mousemove', updatePosition);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    getState: () => {
      const state: MouseCaptureState = { heldButtons: new Set(heldButtons), position, wheelDeltaY };
      wheelDeltaY = 0; // a per-poll delta, not level state — drained on read
      return state;
    },
    dispose: () => {
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousemove', updatePosition);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
