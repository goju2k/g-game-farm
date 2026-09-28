/** KeyboardEvent.code value — layout-independent physical key, e.g. 'KeyA', 'ArrowUp', 'Space'. */
export type PhysicalKey = string;

export type MouseButton = 'left' | 'right' | 'middle' | 'back' | 'forward';

/**
 * `held` is level-triggered (true every frame while down), `justPressed`/
 * `justReleased` are edge-triggered (true only on the frame the transition
 * happened) — this is what lets game systems skip hand-rolling "was this
 * already down last frame" bookkeeping themselves.
 */
export interface DigitalState<K> {
  readonly held: ReadonlySet<K>;
  readonly justPressed: ReadonlySet<K>;
  readonly justReleased: ReadonlySet<K>;
}

export interface MouseFrame {
  readonly buttons: DigitalState<MouseButton>;
  /** Target-local CSS pixels, top-left origin. Undefined before the first mousemove / after mouseleave. */
  readonly position: Readonly<{ x: number; y: number }> | undefined;
  /**
   * `position` already resolved into world units (the ground-plane point
   * under the cursor, in the view the player was actually looking at) —
   * what simulation code should aim with. Resolved at capture time on the
   * machine that owns the screen (see InputCaptureOptions.
   * resolveWorldPosition), so the frame stays meaningful when handed to a
   * simulation that has never seen that screen (coop host). Undefined
   * whenever `position` is, or when no resolver was configured / it
   * couldn't resolve (e.g. before the first frame was drawn).
   */
  readonly worldPosition: Readonly<{ x: number; y: number }> | undefined;
  /** Accumulated wheel deltaY since the previous poll. Zero on most frames. */
  readonly wheelDeltaY: number;
}

export interface GamepadFrame {
  /** Browser-assigned slot. Stable while connected; not guaranteed across reconnects. */
  readonly index: number;
  readonly id: string;
  /** Standard gamepad button indices — naming them (e.g. "A", "cross") is a game/UI concern, not the engine's. */
  readonly buttons: DigitalState<number>;
  /** Analog value per button (0..1), same indexing as `buttons` — meaningful for triggers. */
  readonly buttonValues: readonly number[];
  /** Standard mapping: 0/1 = left stick x/y, 2/3 = right stick x/y. Range -1..1. */
  readonly axes: readonly number[];
}

/**
 * One tick's worth of physical device state — fully normalized, edges
 * already computed. This is the entire surface game/system code may read;
 * it's what makes CLAUDE.md's coop principle #1 ("game logic never touches
 * raw input events directly") structural rather than a convention.
 */
export interface InputFrame {
  readonly keyboard: DigitalState<PhysicalKey>;
  readonly mouse: MouseFrame;
  /** Connected pads only — no placeholder entries for empty slots. */
  readonly gamepads: readonly GamepadFrame[];
}

function emptyDigitalState<K>(): DigitalState<K> {
  return Object.freeze({ held: new Set<K>(), justPressed: new Set<K>(), justReleased: new Set<K>() });
}

export const EMPTY_INPUT_FRAME: InputFrame = Object.freeze({
  keyboard: emptyDigitalState<PhysicalKey>(),
  mouse: Object.freeze({
    buttons: emptyDigitalState<MouseButton>(),
    position: undefined,
    worldPosition: undefined,
    wheelDeltaY: 0,
  }),
  gamepads: Object.freeze([]),
});
