import { describe, expect, it } from 'vitest';
import { createEventRegistry, type EventCommand } from './event-runner.js';

interface Ctx {
  log: string[];
  value: number;
}

function registry() {
  return createEventRegistry<Ctx>()
    .register('log', (c, ctx) => {
      ctx.log.push(String(c['text']));
    })
    .register('tween', (c, ctx) => {
      const to = c['to'] as number;
      const ms = c['ms'] as number;
      const from = ctx.value;
      let t = 0;
      return {
        update: (x, dt) => {
          t += dt;
          x.value = from + (to - from) * Math.min(1, t / ms);
          return t >= ms;
        },
        finish: (x) => {
          x.value = to;
        },
      };
    });
}

const run = (commands: EventCommand[], steps: number[], ctx: Ctx = { log: [], value: 0 }) => {
  const instance = registry().start(commands);
  const done = steps.map((dt) => instance.update(ctx, dt));
  return { ctx, done, instance };
};

describe('event runner', () => {
  it('runs commands in order, waiting on timed ones', () => {
    const { ctx, done } = run(
      [{ cmd: 'log', text: 'a' }, { cmd: 'wait', ms: 30 }, { cmd: 'log', text: 'b' }],
      [10, 10, 10, 10],
    );
    expect(ctx.log).toEqual(['a', 'b']);
    expect(done).toEqual([false, false, true, true]);
  });

  it('parallel starts everything at once and continues when all are done', () => {
    const { ctx, done } = run(
      [{ cmd: 'parallel', do: [{ cmd: 'wait', ms: 20 }, { cmd: 'tween', to: 10, ms: 40 }] }, { cmd: 'log', text: 'after' }],
      [20, 10, 10],
    );
    expect(done).toEqual([false, false, true]);
    expect(ctx.value).toBe(10);
    expect(ctx.log).toEqual(['after']);
  });

  it('async starts a branch without waiting; the event ends when the branch does', () => {
    const { ctx, done } = run([{ cmd: 'async', do: [{ cmd: 'tween', to: 10, ms: 50 }] }, { cmd: 'log', text: 'next' }], [10, 50]);
    expect(ctx.log).toEqual(['next']);
    expect(done).toEqual([false, true]);
  });

  it('skip runs every remaining command (and async branches) to its end state', () => {
    const ctx = { log: [], value: 0 };
    const instance = registry().start([
      { cmd: 'async', do: [{ cmd: 'tween', to: 3, ms: 999 }] },
      { cmd: 'wait', ms: 1000 },
      { cmd: 'log', text: 'end' },
      { cmd: 'tween', to: 7, ms: 1000 },
    ]);
    instance.update(ctx, 10);
    instance.skip(ctx);
    expect(ctx.log).toEqual(['end']);
    expect(ctx.value).toBe(7);
    expect(instance.update(ctx, 0)).toBe(true);
  });

  it('validate lists unknown commands, nested ones included', () => {
    expect(() => registry().validate([{ cmd: 'log' }, { cmd: 'parallel', do: [{ cmd: 'nope' }, { cmd: 'zap' }] }], 'opening.json')).toThrow(
      /opening\.json: unknown event commands: nope, zap/,
    );
    expect(() => registry().register('wait', () => undefined)).toThrow(/already defined/);
  });
});
