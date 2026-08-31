import { World } from '@g-game-farm/engine-ecs';
import type { SceneDefinition } from '@g-game-farm/engine-plugin-api';
import { SceneManager } from './scene-manager.js';

function scene(name: string, log: string[], overrides: Partial<SceneDefinition> = {}): SceneDefinition {
  return {
    name,
    setup: () => log.push(`setup:${name}`),
    teardown: () => log.push(`teardown:${name}`),
    ...overrides,
  };
}

describe('SceneManager.register', () => {
  it('rejects a duplicate scene name', () => {
    const manager = new SceneManager();
    manager.register([scene('a', [])]);
    expect(() => manager.register([scene('a', [])])).toThrow();
  });
});

describe('SceneManager.load', () => {
  it('calls teardown, then World.clear, then the new scene setup, in that order', () => {
    const log: string[] = [];
    const manager = new SceneManager();
    const world = new World();
    manager.register([scene('a', log), scene('b', log)]);

    manager.load('a', world);
    manager.load('b', world);

    expect(log).toEqual(['setup:a', 'teardown:a', 'setup:b']);
  });

  it('throws for an unregistered scene name', () => {
    const manager = new SceneManager();
    expect(() => manager.load('missing', new World())).toThrow();
  });

  it('cancels a pending requestChange()', () => {
    const manager = new SceneManager();
    const world = new World();
    manager.register([scene('a', []), scene('b', []), scene('c', [])]);
    manager.load('a', world);

    manager.requestChange('b');
    manager.load('c', world);

    expect(manager.hasPending()).toBe(false);
    expect(manager.applyPending(world)).toBe(false);
    expect(manager.getActiveName()).toBe('c');
  });

  it('throws if setup() recursively calls load()', () => {
    const manager = new SceneManager();
    const world = new World();
    manager.register([
      {
        name: 'recursive',
        setup: () => manager.load('recursive', world),
      },
    ]);

    expect(() => manager.load('recursive', world)).toThrow();
  });

  it('throws if teardown() recursively calls load()', () => {
    const manager = new SceneManager();
    const world = new World();
    manager.register([
      { name: 'a', setup: () => undefined, teardown: () => manager.load('b', world) },
      { name: 'b', setup: () => undefined },
    ]);
    manager.load('a', world);

    expect(() => manager.load('b', world)).toThrow();
  });
});

describe('SceneManager.requestChange / hasPending / applyPending', () => {
  it('throws immediately for an unregistered name, without waiting for applyPending', () => {
    const manager = new SceneManager();
    expect(() => manager.requestChange('missing')).toThrow();
    expect(manager.hasPending()).toBe(false);
  });

  it('applyPending is a no-op returning false when nothing is pending', () => {
    const manager = new SceneManager();
    const world = new World();
    manager.register([scene('a', [])]);
    manager.load('a', world);

    expect(manager.applyPending(world)).toBe(false);
    expect(manager.getActiveName()).toBe('a');
  });

  it('applyPending loads the requested scene once, then stops reporting it as pending', () => {
    const log: string[] = [];
    const manager = new SceneManager();
    const world = new World();
    manager.register([scene('a', log), scene('b', log)]);
    manager.load('a', world);

    manager.requestChange('b');
    expect(manager.hasPending()).toBe(true);

    expect(manager.applyPending(world)).toBe(true);
    expect(manager.hasPending()).toBe(false);
    expect(manager.getActiveName()).toBe('b');
    expect(manager.applyPending(world)).toBe(false);
    expect(log).toEqual(['setup:a', 'teardown:a', 'setup:b']);
  });
});
