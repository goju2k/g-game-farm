/**
 * Placeholder shape for "one tick's worth of input". Phase 2 (input
 * abstraction layer) will replace this with a concrete, typed structure
 * (buttons, axes, ...) fed by the platform's actual device polling. Until
 * then it exists so the core loop has a stable place to plug input in
 * without game/system code touching raw devices directly.
 */
export type InputFrame = Readonly<Record<string, unknown>>;

export const EMPTY_INPUT_FRAME: InputFrame = Object.freeze({});
