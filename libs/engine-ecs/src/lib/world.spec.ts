import { defineComponent } from './component.js';
import { World } from './world.js';

interface Position {
  x: number;
  y: number;
}
interface Velocity {
  dx: number;
  dy: number;
}
interface Tag {
  label: string;
}

const Position = defineComponent<Position>('world.spec:Position');
const Velocity = defineComponent<Velocity>('world.spec:Velocity');
const Tag = defineComponent<Tag>('world.spec:Tag');

describe('World basic component access', () => {
  it('get/has/set/remove round-trip', () => {
    const world = new World();
    const id = world.createEntity();

    expect(world.has(id, Position)).toBe(false);
    expect(world.get(id, Position)).toBeUndefined();

    world.set(id, Position, { x: 1, y: 2 });
    expect(world.has(id, Position)).toBe(true);
    expect(world.get(id, Position)).toEqual({ x: 1, y: 2 });

    world.remove(id, Position);
    expect(world.has(id, Position)).toBe(false);
  });

  it('destroyEntity clears the entity from every component store', () => {
    const world = new World();
    const id = world.createEntity();
    world.set(id, Position, { x: 1, y: 2 });
    world.set(id, Velocity, { dx: 0, dy: 0 });

    world.destroyEntity(id);

    expect(world.isAlive(id)).toBe(false);
    expect(world.has(id, Position)).toBe(false);
    expect(world.has(id, Velocity)).toBe(false);
  });
});

describe('World.query', () => {
  it('returns only entities that have every requested component', () => {
    const world = new World();

    const both = world.createEntity();
    world.set(both, Position, { x: 0, y: 0 });
    world.set(both, Velocity, { dx: 1, dy: 1 });
    world.set(both, Tag, { label: 'both' });

    const positionOnly = world.createEntity();
    world.set(positionOnly, Position, { x: 5, y: 5 });

    const velocityOnly = world.createEntity();
    world.set(velocityOnly, Velocity, { dx: 2, dy: 2 });

    const results = [...world.query([Position, Velocity, Tag] as const)];

    expect(results).toHaveLength(1);
    expect(results[0][0]).toBe(both);
    expect(results[0][1]).toEqual({ x: 0, y: 0 });
    expect(results[0][2]).toEqual({ dx: 1, dy: 1 });
    expect(results[0][3]).toEqual({ label: 'both' });
  });

  it('returns nothing when a requested component has never been used', () => {
    const world = new World();
    const Unused = defineComponent<{ v: number }>('world.spec:Unused');
    world.createEntity();

    expect([...world.query([Unused] as const)]).toEqual([]);
  });
});

describe('World.snapshot', () => {
  it('is isolated from later mutations, given the immutable-update convention', () => {
    const world = new World();
    const id = world.createEntity();
    world.set(id, Position, { x: 1, y: 1 });

    const before = world.snapshot();
    world.set(id, Position, { x: 99, y: 99 });

    const snapshotted = before.components.get(Position)?.get(id) as Position | undefined;
    expect(snapshotted).toEqual({ x: 1, y: 1 });
    expect(world.get(id, Position)).toEqual({ x: 99, y: 99 });
  });

  it('does not reflect entities created after the snapshot was taken', () => {
    const world = new World();
    const before = world.snapshot();
    world.createEntity();

    expect(before.entities).toHaveLength(0);
  });
});
