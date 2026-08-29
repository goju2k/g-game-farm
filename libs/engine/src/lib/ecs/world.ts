import { EntityManager, type EntityId } from './entity.js';
import type { ComponentTuple, ComponentType } from './component.js';

export interface WorldSnapshot {
  readonly entities: readonly EntityId[];
  readonly components: ReadonlyMap<ComponentType<unknown>, ReadonlyMap<EntityId, unknown>>;
}

export interface ReadonlyWorld {
  isAlive(id: EntityId): boolean;
  has<T>(id: EntityId, type: ComponentType<T>): boolean;
  get<T>(id: EntityId, type: ComponentType<T>): Readonly<T> | undefined;
  query<T extends readonly ComponentType<unknown>[]>(
    types: readonly [...T],
  ): IterableIterator<readonly [EntityId, ...ComponentTuple<T>]>;
  snapshot(): WorldSnapshot;
}

interface ComponentStore {
  readonly type: ComponentType<unknown>;
  readonly map: Map<EntityId, unknown>;
}

/**
 * Component values are treated as immutable: updates must go through `set`
 * with a new object, never mutated in place. That convention is what lets
 * `snapshot()` get away with a shallow copy (see world.spec.ts).
 */
export class World implements ReadonlyWorld {
  private readonly entities = new EntityManager();
  /** Indexed by ComponentType.id; type + map travel together so there's no parallel array to keep in sync. */
  private readonly stores: Array<ComponentStore | undefined> = [];

  createEntity(): EntityId {
    return this.entities.create();
  }

  destroyEntity(id: EntityId): void {
    for (const entry of this.stores) {
      entry?.map.delete(id);
    }
    this.entities.destroy(id);
  }

  isAlive(id: EntityId): boolean {
    return this.entities.isAlive(id);
  }

  set<T>(id: EntityId, type: ComponentType<T>, value: T): void {
    let entry = this.stores[type.id];
    if (!entry) {
      entry = { type, map: new Map<EntityId, unknown>() };
      this.stores[type.id] = entry;
    }
    entry.map.set(id, value);
  }

  get<T>(id: EntityId, type: ComponentType<T>): Readonly<T> | undefined {
    return this.stores[type.id]?.map.get(id) as Readonly<T> | undefined;
  }

  has<T>(id: EntityId, type: ComponentType<T>): boolean {
    return this.stores[type.id]?.map.has(id) ?? false;
  }

  remove<T>(id: EntityId, type: ComponentType<T>): void {
    this.stores[type.id]?.map.delete(id);
  }

  /** Destroys every entity and empties every component store. */
  clear(): void {
    for (const entry of this.stores) {
      entry?.map.clear();
    }
    this.entities.clear();
  }

  *query<T extends readonly ComponentType<unknown>[]>(
    types: readonly [...T],
  ): IterableIterator<readonly [EntityId, ...ComponentTuple<T>]> {
    if (types.length === 0) {
      return;
    }

    const entries: ComponentStore[] = [];
    for (const type of types) {
      const entry = this.stores[type.id];
      if (!entry) {
        return; // a requested component has never been used — no entity can match
      }
      entries.push(entry);
    }

    let driverIndex = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].map.size < entries[driverIndex].map.size) {
        driverIndex = i;
      }
    }

    for (const id of entries[driverIndex].map.keys()) {
      const values: unknown[] = [];
      let matched = true;
      for (const entry of entries) {
        const value = entry.map.get(id);
        if (value === undefined) {
          matched = false;
          break;
        }
        values.push(value);
      }
      if (matched) {
        yield [id, ...values] as unknown as readonly [EntityId, ...ComponentTuple<T>];
      }
    }
  }

  snapshot(): WorldSnapshot {
    const components = new Map<ComponentType<unknown>, ReadonlyMap<EntityId, unknown>>();
    for (const entry of this.stores) {
      if (entry) {
        components.set(entry.type, new Map(entry.map));
      }
    }
    return { entities: [...this.entities.all()], components };
  }
}
