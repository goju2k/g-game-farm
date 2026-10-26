import type { InputFrame, MouseButton } from '@g-game-farm/ribs';

/**
 * What the player asked for this step, in game terms — the only thing the
 * combat systems read. Raw keys/buttons stop here (coop principle: the
 * simulation consumes intents, never devices).
 */
export interface PlayerIntent {
  /** -1, 0 or 1 per axis (8 directions). */
  readonly moveX: number;
  readonly moveY: number;
  /** Edges: true only on the step the button went down. */
  readonly dash: boolean;
  readonly parry: boolean;
  readonly quickSpell: boolean;
  /** Level: the quick-spell button is held — it auto-fires every interval (D-025). */
  readonly quickSpellHeld: boolean;
  readonly castSpell: boolean;
  /** World-space aim (mouse, or the touch controls' aim when a touch spell fired), if any. */
  readonly aim: Readonly<{ x: number; y: number }> | undefined;
  /** The input came from the touch controls this step — selects inputOverrides.touch (touch spec §4). */
  readonly touch: boolean;
}

/**
 * The on-screen controls' names in InputFrame.virtual (see ui/touch-controls.tsx):
 * buttons dash/parry/quickSpell/castSpell, axes moveX/moveY (already
 * quantized to -1/0/1, 8 directions) and touch (1 while the touch UI is in
 * use), plus virtual.aim for spells.
 */
export const VIRTUAL = {
  dash: 'dash',
  parry: 'parry',
  quickSpell: 'quickSpell',
  castSpell: 'castSpell',
  moveX: 'moveX',
  moveY: 'moveY',
  touch: 'touch',
  /** A tap on the game (not on a control): examine what's near (31 §0). */
  examine: 'examine',
} as const;

export interface KeyBindings {
  readonly up: readonly string[];
  readonly down: readonly string[];
  readonly left: readonly string[];
  readonly right: readonly string[];
  readonly dash: readonly string[];
  readonly parry: readonly string[];
  readonly quickSpell: MouseButton;
  readonly castSpell: MouseButton;
}

/** Combat spec v1 §1: WASD, Space dash, Shift parry, left/right click spells. */
export const DEFAULT_BINDINGS: KeyBindings = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  dash: ['Space'],
  parry: ['ShiftLeft', 'ShiftRight'],
  quickSpell: 'left',
  castSpell: 'right',
};

/**
 * Keyboard/mouse and the touch controls produce the same intent (touch spec
 * §0: same intent, different hands) — whichever is active. Keys win over a
 * zero stick so a keyboard player is never stuck.
 */
export function readIntent(input: InputFrame, bindings: KeyBindings = DEFAULT_BINDINGS): PlayerIntent {
  const held = (codes: readonly string[]) => codes.some((code) => input.keyboard.held.has(code));
  const pressed = (codes: readonly string[]) => codes.some((code) => input.keyboard.justPressed.has(code));
  const virtual = input.virtual;
  const vPressed = (name: string) => virtual.buttons.justPressed.has(name);
  const keyX = (held(bindings.right) ? 1 : 0) - (held(bindings.left) ? 1 : 0);
  const keyY = (held(bindings.down) ? 1 : 0) - (held(bindings.up) ? 1 : 0);
  const touchQuickHeld = virtual.buttons.held.has(VIRTUAL.quickSpell);
  const touchSpell = vPressed(VIRTUAL.quickSpell) || touchQuickHeld || vPressed(VIRTUAL.castSpell);
  return {
    moveX: keyX !== 0 || keyY !== 0 ? keyX : Math.sign(virtual.axes[VIRTUAL.moveX] ?? 0),
    moveY: keyX !== 0 || keyY !== 0 ? keyY : Math.sign(virtual.axes[VIRTUAL.moveY] ?? 0),
    dash: pressed(bindings.dash) || vPressed(VIRTUAL.dash),
    parry: pressed(bindings.parry) || vPressed(VIRTUAL.parry),
    quickSpell: input.mouse.buttons.justPressed.has(bindings.quickSpell) || vPressed(VIRTUAL.quickSpell),
    quickSpellHeld: input.mouse.buttons.held.has(bindings.quickSpell) || touchQuickHeld,
    castSpell: input.mouse.buttons.justPressed.has(bindings.castSpell) || vPressed(VIRTUAL.castSpell),
    aim: touchSpell && virtual.aim ? virtual.aim : input.mouse.worldPosition ?? virtual.aim,
    touch: (virtual.axes[VIRTUAL.touch] ?? 0) > 0,
  };
}

/**
 * The action-transform stage between reading intent and acting on it
 * (planning P-004: later acts make the hands disobey — a parry turning into
 * something else, a spell firing on its own). v1 changes nothing; a later
 * transform slots in here without touching input capture or the actions.
 */
export type IntentTransform = (intent: PlayerIntent) => PlayerIntent;

export const identityIntentTransform: IntentTransform = (intent) => intent;

export type BufferedAction = 'dash' | 'parry' | 'quickSpell' | 'castSpell';

/** A press remembered for a few steps so it fires the moment the current action allows it (spec: 6f). */
export interface InputBuffer {
  readonly action: BufferedAction;
  readonly framesLeft: number;
}

/**
 * One step of buffer upkeep: a new press replaces whatever was buffered (the
 * latest intent wins), otherwise the old one ages and expires.
 */
export function updateInputBuffer(buffer: InputBuffer | undefined, intent: PlayerIntent, bufferF: number): InputBuffer | undefined {
  const pressed: BufferedAction | undefined = intent.parry ? 'parry' : intent.dash ? 'dash' : intent.castSpell ? 'castSpell' : intent.quickSpell ? 'quickSpell' : undefined;
  if (pressed) {
    return { action: pressed, framesLeft: bufferF };
  }
  if (!buffer || buffer.framesLeft <= 1) {
    return undefined;
  }
  return { action: buffer.action, framesLeft: buffer.framesLeft - 1 };
}
