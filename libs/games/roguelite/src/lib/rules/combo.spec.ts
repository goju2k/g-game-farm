import { describe, expect, it } from 'vitest';
import { comboBonus, comboBreak, comboCastUsed, comboLevel, comboMoveDone, comboParried, comboPress, comboTick, EMPTY_COMBO, type ComboButton, type ComboData } from './combo.js';

const DATA: ComboData = { levels: { ember: 0, child: 2, teen: 3, adult: 4 }, windowF: 24, rhythmFromLevel: 3 };

function play(buttons: readonly ComboButton[], level: number) {
  let state = EMPTY_COMBO;
  const moves = buttons.map((b) => {
    const result = comboPress(state, b, level, DATA);
    state = comboMoveDone(result.state, DATA);
    return result.move;
  });
  return { moves, state };
}

describe('combo grammar (27_skill-combo-v1 §3)', () => {
  it('levels come from the form', () => {
    expect(comboLevel(DATA, 'child')).toBe(2);
    expect(comboLevel(DATA, 'ember')).toBe(0);
    expect(comboLevel(DATA, 'unknown')).toBe(0);
  });

  it('child Lv2: the 2nd press is the finisher, by its button; the bonus compares the two', () => {
    expect(play(['L', 'L'], 2).moves).toEqual([
      { kind: 'link', button: 'L', index: 0 },
      { kind: 'finish', button: 'L', bonus: 'focus' },
    ]);
    expect(play(['R', 'R'], 2).moves[1]).toEqual({ kind: 'finish', button: 'R', bonus: 'focus' });
    expect(play(['L', 'R'], 2).moves[1]).toEqual({ kind: 'finish', button: 'R', bonus: 'switch' });
    expect(play(['R', 'L'], 2).moves[1]).toEqual({ kind: 'finish', button: 'L', bonus: 'switch' });
  });

  it('after a finisher it starts over; holding L is L L, L L...', () => {
    const { moves, state } = play(['L', 'L', 'L', 'L'], 2);
    expect(moves.map((m) => m.kind)).toEqual(['link', 'finish', 'link', 'finish']);
    expect(state.presses).toEqual([]);
  });

  it('rhythm only from Lv3: every press alternating', () => {
    expect(comboBonus(['L', 'R', 'L'], 3, DATA)).toBe('rhythm');
    expect(comboBonus(['L', 'L', 'R'], 3, DATA)).toBe('switch');
    expect(comboBonus(['R', 'L', 'L'], 3, DATA)).toBe('focus');
    expect(comboBonus(['L', 'R'], 2, DATA)).toBe('switch');
    expect(play(['L', 'R', 'L', 'R'], 4).moves[3]).toEqual({ kind: 'finish', button: 'R', bonus: 'rhythm' });
  });

  it('the window counts only while free, and resets the combo when it runs out', () => {
    let state = comboPress(EMPTY_COMBO, 'L', 2, DATA).state;
    expect(comboTick(state, true)).toBe(state); // the shot hasn't left yet: no window
    state = comboMoveDone(state, DATA);
    for (let i = 0; i < 10; i++) state = comboTick(state, false); // dashing: paused
    expect(state.windowLeftF).toBe(24);
    for (let i = 0; i < 23; i++) state = comboTick(state, true);
    expect(state.presses).toEqual(['L']);
    state = comboTick(state, true);
    expect(state.presses).toEqual([]);
    expect(comboPress(state, 'R', 2, DATA).move.kind).toBe('link'); // a fresh start
  });

  it('a hit or missed parry breaks it; a parry success keeps it and makes the next cast instant', () => {
    const started = comboMoveDone(comboPress(EMPTY_COMBO, 'R', 2, DATA).state, DATA);
    expect(comboBreak(started)).toEqual(EMPTY_COMBO);
    const parried = comboParried(comboTick(started, true), DATA);
    expect(parried.presses).toEqual(['R']);
    expect(parried.windowLeftF).toBe(24);
    expect(parried.nextCastInstant).toBe(true);
    expect(comboCastUsed(parried).nextCastInstant).toBe(false);
  });

  it('no combo level: every press is a plain link', () => {
    expect(comboPress(EMPTY_COMBO, 'L', 0, DATA).move).toEqual({ kind: 'link', button: 'L', index: 0 });
  });
});
