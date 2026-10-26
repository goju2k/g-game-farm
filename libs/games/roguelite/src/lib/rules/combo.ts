/**
 * Skill combos (planning 27_skill-combo-v1.md §3, D-031) — the grammar as a
 * pure state machine, no ECS or input devices: the combat system feeds it
 * the presses it consumes (L = quick spell, R = cast spell) after the intent
 * step, so keyboard and touch combo identically.
 *
 * - Combo level N (by form): the Nth press is the finisher, then it resets.
 *   There is no wrong press.
 * - Presses 1..N-1 are links: L = the quick spell as is, R = a quick pillar.
 * - The finisher follows the last button: L = the fire fan, R = the big pillar.
 * - Its bonus compares the last two presses: same = focus, different =
 *   switch; every press alternating (from rhythm.fromLevel) = rhythm.
 * - The next press must come within windowF of the previous move ending —
 *   time only runs while the player is free (a dash pauses it, doesn't break it).
 * - A hit or a missed parry breaks it; a parry success keeps it and makes the
 *   next cast instant.
 */

export type ComboButton = 'L' | 'R';
export type ComboBonus = 'focus' | 'switch' | 'rhythm';

export interface ComboData {
  /** Combo length by player form; 0 / missing = no combos (the ember). */
  readonly levels: Readonly<Record<string, number>>;
  /** Frames after a move ends in which the next press continues the combo (0.4s). */
  readonly windowF: number;
  /** "Every press alternating" counts from this level up (Lv3+). */
  readonly rhythmFromLevel: number;
}

export interface ComboState {
  readonly presses: readonly ComboButton[];
  /** Free frames left to continue; undefined while the last move is still under way (or no combo). */
  readonly windowLeftF?: number;
  /** A parry success: the next cast (link or finisher R) skips its cast time. */
  readonly nextCastInstant: boolean;
}

export const EMPTY_COMBO: ComboState = { presses: [], nextCastInstant: false };

export type ComboMove = { readonly kind: 'link'; readonly button: ComboButton; readonly index: number } | { readonly kind: 'finish'; readonly button: ComboButton; readonly bonus: ComboBonus };

export function comboLevel(data: ComboData, form: string): number {
  return Math.max(0, Math.floor(data.levels[form] ?? 0));
}

/** The bonus for a finished sequence (last two presses; rhythm when every neighbour differs and the level allows it). */
export function comboBonus(presses: readonly ComboButton[], level: number, data: ComboData): ComboBonus {
  const n = presses.length;
  if (n < 2) return 'focus';
  if (level >= data.rhythmFromLevel && presses.every((p, i) => i === 0 || p !== presses[i - 1])) return 'rhythm';
  return presses[n - 1] === presses[n - 2] ? 'focus' : 'switch';
}

/**
 * A press is consumed: what move it makes, and the state after. The window
 * closes until the move is done (call comboMoveDone, then comboTick counts).
 */
export function comboPress(state: ComboState, button: ComboButton, level: number, data: ComboData): { readonly state: ComboState; readonly move: ComboMove } {
  if (level <= 0) return { state, move: { kind: 'link', button, index: 0 } };
  const presses = [...state.presses, button];
  if (presses.length >= level) {
    return { state: { presses: [], nextCastInstant: state.nextCastInstant }, move: { kind: 'finish', button, bonus: comboBonus(presses, level, data) } };
  }
  return { state: { presses, nextCastInstant: state.nextCastInstant }, move: { kind: 'link', button, index: presses.length - 1 } };
}

/** The move just made has finished (the shot left, the pillar went off): the continue window opens. */
export function comboMoveDone(state: ComboState, data: ComboData): ComboState {
  return state.presses.length > 0 ? { ...state, windowLeftF: data.windowF } : state;
}

/** One simulation step. Only counts while the player is free; when the window runs out the combo resets. */
export function comboTick(state: ComboState, free: boolean): ComboState {
  if (!free || state.windowLeftF === undefined) return state;
  const left = state.windowLeftF - 1;
  return left > 0 ? { ...state, windowLeftF: left } : { presses: [], nextCastInstant: state.nextCastInstant };
}

/** A hit taken or a parry missed: start over. */
export function comboBreak(state: ComboState): ComboState {
  return state.presses.length === 0 && !state.nextCastInstant && state.windowLeftF === undefined ? state : EMPTY_COMBO;
}

/** A parry success: the combo holds (window refreshed) and the next cast is instant. */
export function comboParried(state: ComboState, data: ComboData): ComboState {
  return { ...state, nextCastInstant: true, ...(state.presses.length > 0 ? { windowLeftF: data.windowF } : {}) };
}

/** A cast used the parry's instant cast. */
export function comboCastUsed(state: ComboState): ComboState {
  return state.nextCastInstant ? { ...state, nextCastInstant: false } : state;
}
