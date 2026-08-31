import { EntityManager } from './entity.js';

describe('EntityManager', () => {
  it('issues unique ids on create', () => {
    const manager = new EntityManager();
    const a = manager.create();
    const b = manager.create();
    expect(a).not.toBe(b);
  });

  it('reports newly created entities as alive', () => {
    const manager = new EntityManager();
    const id = manager.create();
    expect(manager.isAlive(id)).toBe(true);
  });

  it('reports destroyed entities as not alive', () => {
    const manager = new EntityManager();
    const id = manager.create();
    manager.destroy(id);
    expect(manager.isAlive(id)).toBe(false);
  });

  it('iterates only alive entities', () => {
    const manager = new EntityManager();
    const a = manager.create();
    const b = manager.create();
    manager.destroy(a);
    expect([...manager.all()]).toEqual([b]);
  });
});
