import { evaluateCondition, type FlagReader } from './condition.js';

function flagsFrom(values: Readonly<Record<string, boolean>>): FlagReader {
  return { get: (flag) => values[flag] ?? false };
}

describe('evaluateCondition', () => {
  describe('flag', () => {
    it('is true when the flag is set true and no equals is given (defaults to true)', () => {
      expect(evaluateCondition({ kind: 'flag', flag: 'a' }, flagsFrom({ a: true }))).toBe(true);
    });

    it('is false when the flag is unset', () => {
      expect(evaluateCondition({ kind: 'flag', flag: 'a' }, flagsFrom({}))).toBe(false);
    });

    it('honors an explicit equals: false', () => {
      expect(evaluateCondition({ kind: 'flag', flag: 'a', equals: false }, flagsFrom({ a: false }))).toBe(true);
      expect(evaluateCondition({ kind: 'flag', flag: 'a', equals: false }, flagsFrom({ a: true }))).toBe(false);
    });
  });

  describe('not', () => {
    it('inverts the inner condition', () => {
      expect(evaluateCondition({ kind: 'not', condition: { kind: 'flag', flag: 'a' } }, flagsFrom({ a: true }))).toBe(false);
      expect(evaluateCondition({ kind: 'not', condition: { kind: 'flag', flag: 'a' } }, flagsFrom({ a: false }))).toBe(true);
    });
  });

  describe('all', () => {
    it('is true only when every condition is true', () => {
      const cond = { kind: 'all' as const, conditions: [{ kind: 'flag' as const, flag: 'a' }, { kind: 'flag' as const, flag: 'b' }] };
      expect(evaluateCondition(cond, flagsFrom({ a: true, b: true }))).toBe(true);
      expect(evaluateCondition(cond, flagsFrom({ a: true, b: false }))).toBe(false);
    });

    it('is true for an empty list (vacuous truth)', () => {
      expect(evaluateCondition({ kind: 'all', conditions: [] }, flagsFrom({}))).toBe(true);
    });
  });

  describe('any', () => {
    it('is true when at least one condition is true', () => {
      const cond = { kind: 'any' as const, conditions: [{ kind: 'flag' as const, flag: 'a' }, { kind: 'flag' as const, flag: 'b' }] };
      expect(evaluateCondition(cond, flagsFrom({ a: false, b: true }))).toBe(true);
      expect(evaluateCondition(cond, flagsFrom({ a: false, b: false }))).toBe(false);
    });

    it('is false for an empty list', () => {
      expect(evaluateCondition({ kind: 'any', conditions: [] }, flagsFrom({}))).toBe(false);
    });
  });

  it('composes nested conditions', () => {
    // all(flag a, any(flag b, not flag c))
    const cond = {
      kind: 'all' as const,
      conditions: [
        { kind: 'flag' as const, flag: 'a' },
        { kind: 'any' as const, conditions: [{ kind: 'flag' as const, flag: 'b' }, { kind: 'not' as const, condition: { kind: 'flag' as const, flag: 'c' } }] },
      ],
    };
    expect(evaluateCondition(cond, flagsFrom({ a: true, b: false, c: true }))).toBe(false); // any(false, not true=false) = false
    expect(evaluateCondition(cond, flagsFrom({ a: true, b: false, c: false }))).toBe(true); // any(false, not false=true) = true
  });
});
