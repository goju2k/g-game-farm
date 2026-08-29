/**
 * Dummy components/events/systems shared by the integration tests in
 * engine.spec.ts. Deliberately generic (no game concepts) and excluded from
 * the public barrel — this module only exists to exercise plugin-api + ECS
 * + the core loop wired together, without needing real game logic.
 */
import { defineComponent } from '../ecs/component.js';
import type { System } from '../plugin-api/types.js';
import { defineEventType } from '../runtime/event-bus.js';

export interface Counter {
  readonly value: number;
}
export const Counter = defineComponent<Counter>('testing:Counter');

export interface Flag {
  readonly on: boolean;
}
export const Flag = defineComponent<Flag>('testing:Flag');

export interface Ping {
  readonly value: number;
}
export const Ping = defineEventType<Ping>('testing:Ping');

/** Increments every entity's Counter by `amount`. */
export function createIncrementSystem(amount = 1): System {
  return {
    name: 'testing:increment',
    run: (ctx) => {
      for (const [id, counter] of ctx.world.query([Counter] as const)) {
        ctx.world.set(id, Counter, { value: counter.value + amount });
      }
    },
  };
}

/** input phase: copies `ctx.input[inputKey]`'s truthiness onto every Counter entity's Flag. */
export function createInputToFlagSystem(inputKey: string): System {
  return {
    name: 'testing:input-to-flag',
    run: (ctx) => {
      const on = Boolean(ctx.input[inputKey]);
      for (const [id] of ctx.world.query([Counter] as const)) {
        ctx.world.set(id, Flag, { on });
      }
    },
  };
}

/** simulation phase: increments Counter for entities whose Flag (set earlier this tick) is on. */
export function createIncrementWhenFlaggedSystem(): System {
  return {
    name: 'testing:increment-when-flagged',
    run: (ctx) => {
      for (const [id, counter, flag] of ctx.world.query([Counter, Flag] as const)) {
        if (flag.on) {
          ctx.world.set(id, Counter, { value: counter.value + 1 });
        }
      }
    },
  };
}

/** simulation phase: emits one Ping per Counter entity — stands in for a judgement system emitting hit events. */
export function createEmitPingSystem(): System {
  return {
    name: 'testing:emit-ping',
    run: (ctx) => {
      for (const [id] of ctx.world.query([Counter] as const)) {
        ctx.events.emit(Ping, { value: id });
      }
    },
  };
}

/** postSimulation phase: consumes this tick's Pings and applies them to Counter — stands in for damage application. */
export function createConsumePingSystem(): System {
  return {
    name: 'testing:consume-ping',
    run: (ctx) => {
      const pingCount = ctx.events.read(Ping).length;
      if (pingCount === 0) {
        return;
      }
      for (const [id, counter] of ctx.world.query([Counter] as const)) {
        ctx.world.set(id, Counter, { value: counter.value + pingCount });
      }
    },
  };
}
