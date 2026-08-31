export interface EventType<T> {
  readonly id: number;
  readonly name: string;
  /** phantom — never assigned, only used by TypeScript to infer T at call sites. */
  readonly __type?: T;
}

const registeredNames = new Set<string>();
let nextEventTypeId = 0;

export function defineEventType<T>(name: string): EventType<T> {
  if (registeredNames.has(name)) {
    throw new Error(`Event "${name}" is already defined.`);
  }
  registeredNames.add(name);
  return { id: nextEventTypeId++, name };
}

export interface ReadonlyEventBus {
  read<T>(type: EventType<T>): readonly T[];
}

export interface EventBus extends ReadonlyEventBus {
  emit<T>(type: EventType<T>, payload: T): void;
}

const EMPTY: readonly never[] = Object.freeze([]);

/**
 * Buffers events for the duration of one simulation tick. `clear()` is called
 * by the engine at the start of each fixed step (see engine.ts) — never at
 * the end — so that systems in later phases of the *same* tick, and the
 * render phase that follows the loop, can still read what was emitted.
 */
export class TickEventBus implements EventBus {
  private readonly buffers: Array<unknown[] | undefined> = [];

  emit<T>(type: EventType<T>, payload: T): void {
    let buffer = this.buffers[type.id];
    if (!buffer) {
      buffer = [];
      this.buffers[type.id] = buffer;
    }
    buffer.push(payload);
  }

  read<T>(type: EventType<T>): readonly T[] {
    return (this.buffers[type.id] as readonly T[] | undefined) ?? (EMPTY as readonly T[]);
  }

  clear(): void {
    this.buffers.length = 0;
  }
}
