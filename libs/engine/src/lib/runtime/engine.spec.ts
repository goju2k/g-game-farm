import type { RenderSystem } from '../plugin-api/types.js';
import {
  Counter,
  Flag,
  Ping,
  createConsumePingSystem,
  createEmitPingSystem,
  createIncrementSystem,
  createIncrementWhenFlaggedSystem,
  createInputToFlagSystem,
} from '../testing/fixtures.js';
import { Engine } from './engine.js';

describe('Engine — end-to-end wiring', () => {
  it('registerComponents/Systems/Scenes -> loadScene -> tick moves state as expected', () => {
    const engine = new Engine();
    engine.registerComponents([Counter]);
    engine.registerSystems({ simulation: [createIncrementSystem(1)] });
    engine.registerScenes([
      {
        name: 'main',
        setup: (world) => {
          const id = world.createEntity();
          world.set(id, Counter, { value: 0 });
        },
      },
    ]);

    expect(engine.getRegisteredComponentTypes()).toContain(Counter);

    engine.loadScene('main');
    engine.tick(1000 / 60);

    const [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(1);
  });
});

describe('Engine — fixed-timestep accumulator', () => {
  const fixedDeltaMs = 1000 / 60;

  function makeEngine(onRender: () => void) {
    const engine = new Engine({ fixedDeltaMs });
    engine.registerComponents([Counter]);
    engine.registerSystems({
      simulation: [createIncrementSystem(1)],
      render: [{ name: 'testing:render-spy', run: onRender }],
    });
    engine.registerScenes([
      {
        name: 'main',
        setup: (world) => {
          const id = world.createEntity();
          world.set(id, Counter, { value: 0 });
        },
      },
    ]);
    engine.loadScene('main');
    return engine;
  }

  it('runs zero simulation steps when deltaMs is under one fixed step, but still runs the render phase', () => {
    let renderCalls = 0;
    const engine = makeEngine(() => {
      renderCalls++;
    });

    engine.tick(fixedDeltaMs / 2);

    const [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(0);
    expect(renderCalls).toBe(1);
  });

  it('runs floor(deltaMs / fixedDeltaMs) steps per call and carries the remainder into the next tick', () => {
    const engine = makeEngine(() => undefined);

    engine.tick(fixedDeltaMs * 2.5);
    let [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(2);

    engine.tick(fixedDeltaMs * 0.5);
    [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(3);
  });

  it('caps the number of simulation steps a single tick() call can run', () => {
    const engine = new Engine({ fixedDeltaMs, maxSubStepsPerFrame: 3 });
    engine.registerComponents([Counter]);
    engine.registerSystems({ simulation: [createIncrementSystem(1)] });
    engine.registerScenes([
      {
        name: 'main',
        setup: (world) => {
          const id = world.createEntity();
          world.set(id, Counter, { value: 0 });
        },
      },
    ]);
    engine.loadScene('main');

    engine.tick(fixedDeltaMs * 1000); // a huge stall

    const [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(3);
  });
});

describe('Engine — input frame consumption', () => {
  it('lets a simulation-phase system read what an input-phase system wrote earlier in the same tick', () => {
    const engine = new Engine();
    engine.registerComponents([Counter, Flag]);
    engine.registerSystems({
      input: [createInputToFlagSystem('fire')],
      simulation: [createIncrementWhenFlaggedSystem()],
    });
    engine.registerScenes([
      {
        name: 'main',
        setup: (world) => {
          const id = world.createEntity();
          world.set(id, Counter, { value: 0 });
        },
      },
    ]);
    engine.loadScene('main');

    engine.tick(1000 / 60, { fire: true });
    let [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(1);

    engine.tick(1000 / 60); // input omitted -> EMPTY_INPUT_FRAME -> Flag.on === false
    [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(1);
  });
});

describe('Engine — event-based judgement flow', () => {
  it('lets a postSimulation-phase system consume events a simulation-phase system emitted in the same tick', () => {
    const engine = new Engine();
    engine.registerComponents([Counter]);
    engine.registerSystems({
      simulation: [createEmitPingSystem()],
      postSimulation: [createConsumePingSystem()],
    });
    engine.registerScenes([
      {
        name: 'main',
        setup: (world) => {
          const id = world.createEntity();
          world.set(id, Counter, { value: 0 });
        },
      },
    ]);
    engine.loadScene('main');

    engine.tick(1000 / 60);

    const [[, counter]] = [...engine.world.query([Counter] as const)];
    expect(counter.value).toBe(1);
  });

  it('clears the event bus at the start of each tick — nothing carries over', () => {
    let observedCountOnTickTwo = -1;
    const engine = new Engine();
    engine.registerComponents([Counter]);
    engine.registerSystems({
      simulation: [
        {
          name: 'testing:emit-once',
          run: (ctx) => {
            if (ctx.tick === 1) {
              ctx.events.emit(Ping, { value: 1 });
            }
          },
        },
      ],
      postSimulation: [
        {
          name: 'testing:observe',
          run: (ctx) => {
            if (ctx.tick === 2) {
              observedCountOnTickTwo = ctx.events.read(Ping).length;
            }
          },
        },
      ],
    });
    engine.registerScenes([{ name: 'main', setup: () => undefined }]);
    engine.loadScene('main');

    engine.tick(1000 / 60);
    engine.tick(1000 / 60);

    expect(observedCountOnTickTwo).toBe(0);
  });
});

describe('Engine — scene transitions', () => {
  it('wipes the previous scene entities before running the new scene setup', () => {
    const engine = new Engine();
    engine.registerComponents([Counter]);
    engine.registerScenes([
      {
        name: 'a',
        setup: (world) => {
          for (let i = 0; i < 3; i++) {
            const id = world.createEntity();
            world.set(id, Counter, { value: 0 });
          }
        },
      },
      {
        name: 'b',
        setup: (world) => {
          const id = world.createEntity();
          world.set(id, Counter, { value: 0 });
        },
      },
    ]);

    engine.loadScene('a');
    expect([...engine.world.query([Counter] as const)]).toHaveLength(3);

    engine.loadScene('b');
    expect([...engine.world.query([Counter] as const)]).toHaveLength(1);
  });
});

describe('Engine — render phase read-only enforcement (type-level)', () => {
  it('does not typecheck if a render system tries to mutate the world', () => {
    const illegalRenderSystem: RenderSystem = {
      name: 'testing:illegal',
      run: (ctx) => {
        // @ts-expect-error — ReadonlyWorld has no createEntity(); this must fail to typecheck.
        ctx.world.createEntity();
      },
    };
    expect(illegalRenderSystem.name).toBe('testing:illegal');
  });

  it('does not typecheck if a render system tries to load a texture through ctx.renderer', () => {
    const illegalRenderSystem: RenderSystem = {
      name: 'testing:illegal-renderer-use',
      run: (ctx) => {
        // @ts-expect-error — FrameRenderer has no createTexture(); only EngineRenderer (engine.renderer) does.
        ctx.renderer.createTexture(null, { filter: 'nearest' });
      },
    };
    expect(illegalRenderSystem.name).toBe('testing:illegal-renderer-use');
  });
});

describe('Engine — headless rendering (no `render` option)', () => {
  it('gives render systems a working no-op FrameRenderer instead of leaving ctx.renderer undefined', () => {
    const calls: string[] = [];
    const engine = new Engine();
    engine.registerSystems({
      render: [
        {
          name: 'testing:uses-renderer',
          run: (ctx) => {
            ctx.renderer.setCamera({ x: 0, y: 0, zoom: 1 });
            ctx.renderer.submitSprite({
              layer: 'nonexistent',
              texture: 0 as never,
              sx: 0, sy: 0, sWidth: 1, sHeight: 1,
              x: 0, y: 0, width: 1, height: 1,
            });
            calls.push('ran');
          },
        },
      ],
    });
    engine.registerScenes([{ name: 'main', setup: () => undefined }]);
    engine.loadScene('main');

    expect(() => engine.tick(1000 / 60)).not.toThrow();
    expect(calls).toEqual(['ran']);
  });

  it('engine.renderer.createTexture throws (loudly, not silently) when no canvas was configured', () => {
    const engine = new Engine();
    expect(() => engine.renderer.createTexture(null as never, { filter: 'nearest' })).toThrow();
  });
});
