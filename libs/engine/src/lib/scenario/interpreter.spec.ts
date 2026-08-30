import type { FlagWriter } from './condition.js';
import { createScenarioState, stepScenario, type ScenarioCommand } from './interpreter.js';

function makeFlags(initial: Readonly<Record<string, boolean>> = {}): FlagWriter {
  const values: Record<string, boolean> = { ...initial };
  return {
    get: (flag) => values[flag] ?? false,
    set: (flag, value) => {
      values[flag] = value;
    },
  };
}

/** A custom command whose handler is a simple queue: pop `true` results off `results` on each call, defaulting to blocking (false) once exhausted. */
function makeRunCustomFromQueue(results: readonly boolean[]) {
  let i = 0;
  const calls: unknown[] = [];
  const runCustom = (command: unknown): boolean => {
    calls.push(command);
    const result = results[i] ?? false;
    i++;
    return result;
  };
  return { runCustom, calls };
}

describe('stepScenario', () => {
  it('finishes immediately for an empty program', () => {
    const state = stepScenario(createScenarioState(), [], { deltaMs: 16, flags: makeFlags(), runCustom: () => true });
    expect(state.finished).toBe(true);
  });

  it('returns the same finished state without re-running anything once finished', () => {
    const finished = { pc: 5, waitingUntilMs: undefined, finished: true };
    const runCustom = vi.fn(() => true);
    const result = stepScenario(finished, [{ type: 'custom', command: 'x' }], { deltaMs: 16, flags: makeFlags(), runCustom });
    expect(result).toBe(finished);
    expect(runCustom).not.toHaveBeenCalled();
  });

  describe('wait', () => {
    it('blocks for the given duration, counting down across ticks', () => {
      const program: readonly ScenarioCommand<never>[] = [{ type: 'wait', ms: 100 }];
      let state = createScenarioState();
      state = stepScenario(state, program, { deltaMs: 40, flags: makeFlags(), runCustom: () => true });
      expect(state.finished).toBe(false);
      expect(state.waitingUntilMs).toBe(100);

      state = stepScenario(state, program, { deltaMs: 40, flags: makeFlags(), runCustom: () => true });
      expect(state.waitingUntilMs).toBe(60);

      state = stepScenario(state, program, { deltaMs: 40, flags: makeFlags(), runCustom: () => true });
      expect(state.waitingUntilMs).toBe(20);
    });

    it('advances past the wait once the duration elapses, discarding overshoot', () => {
      const program: readonly ScenarioCommand<never>[] = [{ type: 'wait', ms: 50 }];
      let state = stepScenario(createScenarioState(), program, { deltaMs: 10, flags: makeFlags(), runCustom: () => true });
      // Big overshoot in one tick.
      state = stepScenario(state, program, { deltaMs: 1000, flags: makeFlags(), runCustom: () => true });
      expect(state.finished).toBe(true); // program has only the one wait command
      expect(state.waitingUntilMs).toBeUndefined();
    });
  });

  describe('waitUntil', () => {
    it('blocks while the condition is false and proceeds once true', () => {
      const program: readonly ScenarioCommand<never>[] = [{ type: 'waitUntil', condition: { kind: 'flag', flag: 'ready' } }];
      const flags = makeFlags({ ready: false });
      let state = stepScenario(createScenarioState(), program, { deltaMs: 16, flags, runCustom: () => true });
      expect(state.finished).toBe(false);
      expect(state.pc).toBe(0);

      state = stepScenario(state, program, { deltaMs: 16, flags, runCustom: () => true });
      expect(state.finished).toBe(false); // still false

      flags.set('ready', true);
      state = stepScenario(state, program, { deltaMs: 16, flags, runCustom: () => true });
      expect(state.finished).toBe(true);
    });
  });

  describe('setFlag', () => {
    it('writes the flag and advances in the same tick', () => {
      const program: readonly ScenarioCommand<never>[] = [{ type: 'setFlag', flag: 'done', value: true }];
      const flags = makeFlags();
      const state = stepScenario(createScenarioState(), program, { deltaMs: 16, flags, runCustom: () => true });
      expect(flags.get('done')).toBe(true);
      expect(state.finished).toBe(true);
    });
  });

  describe('label / goto / if', () => {
    it('goto jumps unconditionally to the named label', () => {
      const program: readonly ScenarioCommand<never>[] = [
        { type: 'goto', label: 'skip' },
        { type: 'setFlag', flag: 'shouldNotRun', value: true },
        { type: 'label', name: 'skip' },
        { type: 'setFlag', flag: 'reached', value: true },
      ];
      const flags = makeFlags();
      const state = stepScenario(createScenarioState(), program, { deltaMs: 16, flags, runCustom: () => true });
      expect(flags.get('shouldNotRun')).toBe(false);
      expect(flags.get('reached')).toBe(true);
      expect(state.finished).toBe(true);
    });

    it('if jumps only when the condition is true, otherwise falls through', () => {
      const program: readonly ScenarioCommand<never>[] = [
        { type: 'if', condition: { kind: 'flag', flag: 'skip' }, goto: 'end' },
        { type: 'setFlag', flag: 'fellThrough', value: true },
        { type: 'label', name: 'end' },
      ];
      const flagsFalse = makeFlags({ skip: false });
      stepScenario(createScenarioState(), program, { deltaMs: 16, flags: flagsFalse, runCustom: () => true });
      expect(flagsFalse.get('fellThrough')).toBe(true);

      const flagsTrue = makeFlags({ skip: true });
      stepScenario(createScenarioState(), program, { deltaMs: 16, flags: flagsTrue, runCustom: () => true });
      expect(flagsTrue.get('fellThrough')).toBe(false);
    });

    it('throws for a goto/if targeting an unknown label', () => {
      const program: readonly ScenarioCommand<never>[] = [{ type: 'goto', label: 'nowhere' }];
      expect(() => stepScenario(createScenarioState(), program, { deltaMs: 16, flags: makeFlags(), runCustom: () => true })).toThrow(/no label "nowhere"/);
    });

    it('throws when a goto/if cycle never reaches a blocking command (infinite-loop guard)', () => {
      const program: readonly ScenarioCommand<never>[] = [
        { type: 'label', name: 'loop' },
        { type: 'goto', label: 'loop' },
      ];
      expect(() => stepScenario(createScenarioState(), program, { deltaMs: 16, flags: makeFlags(), runCustom: () => true })).toThrow(/infinite goto\/if loop/);
    });
  });

  describe('custom', () => {
    it('advances past the command once its handler returns true', () => {
      const { runCustom, calls } = makeRunCustomFromQueue([true]);
      const program: readonly ScenarioCommand<string>[] = [{ type: 'custom', command: 'spawn' }];
      const state = stepScenario(createScenarioState(), program, { deltaMs: 16, flags: makeFlags(), runCustom });
      expect(calls).toEqual(['spawn']);
      expect(state.finished).toBe(true);
    });

    it('re-invokes the same command every tick while its handler keeps returning false', () => {
      const { runCustom, calls } = makeRunCustomFromQueue([false, false, true]);
      const program: readonly ScenarioCommand<string>[] = [{ type: 'custom', command: 'wait-for-input' }];
      let state = createScenarioState();
      state = stepScenario(state, program, { deltaMs: 16, flags: makeFlags(), runCustom });
      expect(state.finished).toBe(false);
      state = stepScenario(state, program, { deltaMs: 16, flags: makeFlags(), runCustom });
      expect(state.finished).toBe(false);
      state = stepScenario(state, program, { deltaMs: 16, flags: makeFlags(), runCustom });
      expect(state.finished).toBe(true);
      expect(calls).toHaveLength(3);
    });
  });

  it('runs a realistic mixed program end to end across multiple ticks', () => {
    // wait 50ms -> spawn (custom, one-shot) -> waitUntil cleared -> setFlag done
    const program: readonly ScenarioCommand<string>[] = [
      { type: 'wait', ms: 50 },
      { type: 'custom', command: 'spawn' },
      { type: 'waitUntil', condition: { kind: 'flag', flag: 'cleared' } },
      { type: 'setFlag', flag: 'done', value: true },
    ];
    const flags = makeFlags();
    let state = createScenarioState();
    const runCustom = () => true;

    state = stepScenario(state, program, { deltaMs: 30, flags, runCustom }); // still waiting (30/50)
    expect(state.finished).toBe(false);
    expect(flags.get('done')).toBe(false);

    state = stepScenario(state, program, { deltaMs: 30, flags, runCustom }); // wait done, spawn runs, now blocked on waitUntil
    expect(state.finished).toBe(false);
    expect(flags.get('cleared')).toBe(false);

    state = stepScenario(state, program, { deltaMs: 16, flags, runCustom }); // still not cleared
    expect(state.finished).toBe(false);

    flags.set('cleared', true);
    state = stepScenario(state, program, { deltaMs: 16, flags, runCustom });
    expect(state.finished).toBe(true);
    expect(flags.get('done')).toBe(true);
  });
});
