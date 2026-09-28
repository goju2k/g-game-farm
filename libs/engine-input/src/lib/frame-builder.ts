import { computeDigitalState } from './digital-state.js';
import type { GamepadFrame, InputFrame, MouseButton, MouseFrame, PhysicalKey } from './types.js';

export interface RawGamepadState {
  readonly index: number;
  readonly id: string;
  readonly heldButtons: ReadonlySet<number>;
  readonly buttonValues: readonly number[];
  readonly axes: readonly number[];
}

/** What each capture's getState() returns — "currently held", no edges yet. */
export interface RawInputState {
  readonly keyboard: { readonly held: ReadonlySet<PhysicalKey> };
  readonly mouse: {
    readonly heldButtons: ReadonlySet<MouseButton>;
    readonly position: Readonly<{ x: number; y: number }> | undefined;
    readonly wheelDeltaY: number;
  };
  /** Connected pads only. */
  readonly gamepads: readonly RawGamepadState[];
}

/** Screen (target-local CSS px) -> world point, or undefined if it can't be resolved right now. */
export type ScreenToWorldResolver = (screen: Readonly<{ x: number; y: number }>) => Readonly<{ x: number; y: number }> | undefined;

/**
 * The only place edges get computed. `previous` is the RawInputState from
 * the prior poll (`undefined` on the very first poll — see
 * computeDigitalState). Must be called exactly once per tick(), never once
 * per fixed sub-step — Engine.tick() already reuses the same InputFrame
 * across every sub-step in one call, so calling this more than once per
 * real frame would make edges depend on how many sub-steps happened to run.
 */
export function buildInputFrame(
  current: RawInputState,
  previous: RawInputState | undefined,
  resolveWorldPosition?: ScreenToWorldResolver,
): InputFrame {
  const keyboard = computeDigitalState(previous?.keyboard.held, current.keyboard.held);

  const { position } = current.mouse;
  const mouse: MouseFrame = {
    buttons: computeDigitalState(previous?.mouse.heldButtons, current.mouse.heldButtons),
    position,
    worldPosition: position !== undefined && resolveWorldPosition ? resolveWorldPosition(position) : undefined,
    wheelDeltaY: current.mouse.wheelDeltaY,
  };

  const previousGamepadsByIndex = new Map(previous?.gamepads.map((pad) => [pad.index, pad] as const));
  const gamepads: readonly GamepadFrame[] = current.gamepads.map((pad) => ({
    index: pad.index,
    id: pad.id,
    // A pad with no entry in previousGamepadsByIndex (just connected) is
    // treated as a first poll: everything currently held becomes justPressed.
    buttons: computeDigitalState(previousGamepadsByIndex.get(pad.index)?.heldButtons, pad.heldButtons),
    buttonValues: pad.buttonValues,
    axes: pad.axes,
  }));

  return { keyboard, mouse, gamepads };
}
