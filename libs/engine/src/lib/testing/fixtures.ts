/**
 * Dummy components/events/systems shared by the integration tests in
 * engine.spec.ts. Deliberately generic (no game concepts) and excluded from
 * the public barrel — this module only exists to exercise plugin-api + ECS
 * + the core loop wired together, without needing real game logic.
 */
import { defineComponent } from '../ecs/component.js';
import { EMPTY_INPUT_FRAME, type InputFrame, type PhysicalKey } from '../input/types.js';
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

/** input phase: copies whether `key` is held onto every Counter entity's Flag. */
export function createInputToFlagSystem(key: PhysicalKey): System {
  return {
    name: 'testing:input-to-flag',
    run: (ctx) => {
      const on = ctx.input.keyboard.held.has(key);
      for (const [id] of ctx.world.query([Counter] as const)) {
        ctx.world.set(id, Flag, { on });
      }
    },
  };
}

/** Builds an InputFrame with the given physical keys held, as if this were the first poll (so they're also justPressed). */
export function frameWithKeysHeld(...codes: readonly PhysicalKey[]): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() },
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

/** Requests a scene change unconditionally every time it runs — stands in for a game-over trigger. */
export function createRequestSceneChangeSystem(name: string): System {
  return {
    name: 'testing:request-scene-change',
    run: (ctx) => {
      ctx.requestSceneChange(name);
    },
  };
}
