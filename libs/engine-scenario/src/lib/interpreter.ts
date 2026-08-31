import { evaluateCondition, type Condition, type FlagWriter } from './condition.js';

/**
 * The control-flow primitives (wait/waitUntil/label/goto/if/setFlag) are
 * generic scenario-scripting machinery — genre-agnostic in the same way
 * the ECS or the animation player are. `custom` is the extension point a
 * game plugs its own domain commands into (spawning a wave, showing
 * dialogue, changing rooms — none of which the engine has any business
 * knowing about), parameterized by `TCustom` so a game's command union
 * flows through with full type safety instead of `unknown`.
 */
export type ScenarioCommand<TCustom> =
  | { readonly type: 'wait'; readonly ms: number }
  | { readonly type: 'waitUntil'; readonly condition: Condition }
  | { readonly type: 'label'; readonly name: string }
  | { readonly type: 'goto'; readonly label: string }
  | { readonly type: 'if'; readonly condition: Condition; readonly goto: string }
  | { readonly type: 'setFlag'; readonly flag: string; readonly value: boolean }
  | { readonly type: 'custom'; readonly command: TCustom };

export interface ScenarioState {
  readonly pc: number;
  readonly waitingUntilMs: number | undefined;
  readonly finished: boolean;
}

export function createScenarioState(): ScenarioState {
  return { pc: 0, waitingUntilMs: undefined, finished: false };
}

export interface ScenarioStepContext<TCustom> {
  readonly deltaMs: number;
  readonly flags: FlagWriter;
  /**
   * Called once per tick while `pc` points at a `custom` command. Return
   * true once it has fully completed as of this call (pc advances
   * immediately, in the same step — a one-shot action just always returns
   * true); false to keep blocking on it, including across many future
   * ticks (e.g. dialogue waiting on a keypress).
   */
  readonly runCustom: (command: TCustom) => boolean;
}

function resolveLabel<TCustom>(program: readonly ScenarioCommand<TCustom>[], label: string): number {
  const index = program.findIndex((c) => c.type === 'label' && c.name === label);
  if (index === -1) {
    throw new Error(`scenario program: no label "${label}"`);
  }
  return index;
}

/**
 * Advances a scenario program by one tick. "Instant" commands
 * (label/goto/if/setFlag, and a custom command whose handler returns true
 * immediately) resolve in a loop within this same call — mirrors
 * stepAnimationPlayer looping through frame transitions covered by one
 * deltaMs. The loop is bounded by program.length: unlike
 * stepAnimationPlayer (which terminates because elapsedMs strictly
 * decreases), nothing here decreases automatically, so a hand-authored
 * program with a goto/if cycle and no intervening wait/waitUntil/custom
 * genuinely can loop forever — this is a real author-error guard, not
 * defensive code for something that can't happen.
 */
export function stepScenario<TCustom>(
  state: ScenarioState,
  program: readonly ScenarioCommand<TCustom>[],
  ctx: ScenarioStepContext<TCustom>,
): ScenarioState {
  if (state.finished) {
    return state;
  }

  let pc = state.pc;
  let waitingUntilMs = state.waitingUntilMs;

  if (waitingUntilMs !== undefined) {
    const remaining = waitingUntilMs - ctx.deltaMs;
    if (remaining > 0) {
      return { pc, waitingUntilMs: remaining, finished: false };
    }
    waitingUntilMs = undefined;
    pc += 1;
  }

  for (let guard = 0; guard <= program.length; guard++) {
    if (pc >= program.length) {
      return { pc, waitingUntilMs: undefined, finished: true };
    }
    const command = program[pc];
    switch (command.type) {
      case 'label':
        pc += 1;
        continue;
      case 'goto':
        pc = resolveLabel(program, command.label);
        continue;
      case 'if':
        pc = evaluateCondition(command.condition, ctx.flags) ? resolveLabel(program, command.goto) : pc + 1;
        continue;
      case 'setFlag':
        ctx.flags.set(command.flag, command.value);
        pc += 1;
        continue;
      case 'wait':
        return { pc, waitingUntilMs: command.ms, finished: false };
      case 'waitUntil':
        if (evaluateCondition(command.condition, ctx.flags)) {
          pc += 1;
          continue;
        }
        return { pc, waitingUntilMs: undefined, finished: false };
      case 'custom':
        if (ctx.runCustom(command.command)) {
          pc += 1;
          continue;
        }
        return { pc, waitingUntilMs: undefined, finished: false };
    }
  }
  throw new Error(
    'scenario program: exceeded program.length instant-command steps in one tick — likely an infinite goto/if loop with no wait/waitUntil/custom in between.',
  );
}
