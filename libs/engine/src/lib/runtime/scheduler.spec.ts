import type { RenderContext, System, SystemContext } from '../plugin-api/types.js';
import { SystemScheduler } from './scheduler.js';

const dummyContext = {} as SystemContext;
const dummyRenderContext = {} as RenderContext;

function recorder(log: string[], name: string, order?: number): System {
  return { name, order, run: () => log.push(name) };
}

describe('SystemScheduler', () => {
  it('runs each phase only via its matching run* method, in registration order for ties', () => {
    const log: string[] = [];
    const scheduler = new SystemScheduler();

    scheduler.register({
      input: [recorder(log, 'input-a'), recorder(log, 'input-b')],
      simulation: [recorder(log, 'sim-a')],
      postSimulation: [recorder(log, 'post-a')],
      render: [{ name: 'render-a', run: () => log.push('render-a') }],
    });

    scheduler.runInput(dummyContext);
    scheduler.runSimulation(dummyContext);
    scheduler.runPostSimulation(dummyContext);
    scheduler.runRender(dummyRenderContext);

    expect(log).toEqual(['input-a', 'input-b', 'sim-a', 'post-a', 'render-a']);
  });

  it('sorts systems within a phase by ascending order', () => {
    const log: string[] = [];
    const scheduler = new SystemScheduler();

    scheduler.register({
      simulation: [recorder(log, 'high', 10), recorder(log, 'low', -5), recorder(log, 'mid', 0)],
    });

    scheduler.runSimulation(dummyContext);

    expect(log).toEqual(['low', 'mid', 'high']);
  });

  it('keeps registration order for systems with equal (or missing) order', () => {
    const log: string[] = [];
    const scheduler = new SystemScheduler();

    scheduler.register({ simulation: [recorder(log, 'first'), recorder(log, 'second')] });
    scheduler.register({ simulation: [recorder(log, 'third')] });

    scheduler.runSimulation(dummyContext);

    expect(log).toEqual(['first', 'second', 'third']);
  });

  it('accumulates systems across multiple register() calls', () => {
    const log: string[] = [];
    const scheduler = new SystemScheduler();

    scheduler.register({ input: [recorder(log, 'a')] });
    scheduler.register({ input: [recorder(log, 'b')] });
    scheduler.runInput(dummyContext);

    expect(log).toEqual(['a', 'b']);
  });
});
