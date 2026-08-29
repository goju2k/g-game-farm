export type EntityId = number & { readonly __brand: 'EntityId' };

export class EntityManager {
  private nextId = 0;
  private readonly alive = new Set<EntityId>();

  create(): EntityId {
    const id = this.nextId++ as EntityId;
    this.alive.add(id);
    return id;
  }

  destroy(id: EntityId): void {
    this.alive.delete(id);
  }

  isAlive(id: EntityId): boolean {
    return this.alive.has(id);
  }

  all(): IterableIterator<EntityId> {
    return this.alive.values();
  }

  clear(): void {
    this.alive.clear();
  }
}
