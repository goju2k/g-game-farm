import type { DigitalState, GamepadFrame, InputFrame } from './types.js';

/**
 * Edge (justPressed/justReleased) bookkeeping between the host's polling
 * rate and the simulation's fixed step. A frame's edges must reach the
 * simulation exactly once: not once per sub-step when one frame runs
 * several steps (a tap would dash twice), and not zero times when a frame
 * runs none (a tap would vanish). See Engine.tick for the delivery rule.
 */

const NONE: ReadonlySet<never> = Object.freeze(new Set<never>());

function union<K>(a: ReadonlySet<K>, b: ReadonlySet<K>): ReadonlySet<K> {
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  return new Set([...a, ...b]);
}

function mergeDigital<K>(earlier: DigitalState<K>, later: DigitalState<K>): DigitalState<K> {
  return {
    held: later.held,
    justPressed: union(earlier.justPressed, later.justPressed),
    justReleased: union(earlier.justReleased, later.justReleased),
  };
}

function withoutDigitalEdges<K>(state: DigitalState<K>): DigitalState<K> {
  if (state.justPressed.size === 0 && state.justReleased.size === 0) {
    return state;
  }
  return { held: state.held, justPressed: NONE as ReadonlySet<K>, justReleased: NONE as ReadonlySet<K> };
}

/**
 * `later`'s levels (held, positions, axes) with both frames' edges — what an
 * undelivered `earlier` frame and the current one add up to. A pad present
 * only in `earlier` (disconnected since) is dropped, edges and all.
 */
export function mergeInputEdges(earlier: InputFrame, later: InputFrame): InputFrame {
  const earlierPads = new Map(earlier.gamepads.map((pad) => [pad.index, pad] as const));
  return {
    keyboard: mergeDigital(earlier.keyboard, later.keyboard),
    mouse: { ...later.mouse, buttons: mergeDigital(earlier.mouse.buttons, later.mouse.buttons) },
    gamepads: later.gamepads.map((pad): GamepadFrame => {
      const before = earlierPads.get(pad.index);
      return before ? { ...pad, buttons: mergeDigital(before.buttons, pad.buttons) } : pad;
    }),
  };
}

/** The same frame with every justPressed/justReleased emptied — what sub-steps after the first see. */
export function withoutInputEdges(frame: InputFrame): InputFrame {
  return {
    keyboard: withoutDigitalEdges(frame.keyboard),
    mouse: { ...frame.mouse, buttons: withoutDigitalEdges(frame.mouse.buttons) },
    gamepads: frame.gamepads.map((pad) => ({ ...pad, buttons: withoutDigitalEdges(pad.buttons) })),
  };
}
