import { createSnapshotStore, World, type RenderContext } from '@g-game-farm/ribs';
import { Chaser } from '../components.js';
import { createMonsterCountSystem } from './monster-count-hud.js';

function makeRenderContext(world: World): RenderContext {
  return { world, events: undefined, alpha: 0, renderer: undefined } as unknown as RenderContext;
}

describe('createMonsterCountSystem', () => {
  it('publishes 0 when no Chaser entities exist', () => {
    const world = new World();
    const store = createSnapshotStore(-1);
    const system = createMonsterCountSystem(store);

    system.run(makeRenderContext(world));

    expect(store.getSnapshot()).toBe(0);
  });

  it('publishes the exact count of Chaser-tagged entities', () => {
    const world = new World();
    for (let i = 0; i < 3; i++) {
      const id = world.createEntity();
      world.set(id, Chaser, { speed: 10 });
    }
    const store = createSnapshotStore(0);
    const system = createMonsterCountSystem(store);

    system.run(makeRenderContext(world));

    expect(store.getSnapshot()).toBe(3);
  });

  it('ignores entities that do not have Chaser', () => {
    const world = new World();
    const chaserEntity = world.createEntity();
    world.set(chaserEntity, Chaser, { speed: 10 });
    world.createEntity(); // no components at all

    const store = createSnapshotStore(0);
    const system = createMonsterCountSystem(store);

    system.run(makeRenderContext(world));

    expect(store.getSnapshot()).toBe(1);
  });

  it('reflects a Chaser entity being destroyed between ticks', () => {
    const world = new World();
    const a = world.createEntity();
    world.set(a, Chaser, { speed: 10 });
    const b = world.createEntity();
    world.set(b, Chaser, { speed: 10 });
    const store = createSnapshotStore(0);
    const system = createMonsterCountSystem(store);

    system.run(makeRenderContext(world));
    expect(store.getSnapshot()).toBe(2);

    world.destroyEntity(a);
    system.run(makeRenderContext(world));
    expect(store.getSnapshot()).toBe(1);
  });
});
