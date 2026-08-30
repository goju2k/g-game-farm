import type { FlagWriter, World } from '@g-game-farm/ribs';
import { Flags } from '../components.js';

/**
 * Adapts this room's Flags singleton entity to the engine's generic
 * FlagWriter interface — every room's create-room-scene.ts setup() creates
 * exactly one Flags entity, so this should never actually fail to find one
 * outside of a genuine bug.
 */
export function createRoomFlagWriter(world: World): FlagWriter {
  const match = [...world.query([Flags] as const)][0];
  if (!match) {
    throw new Error('createRoomFlagWriter: no Flags singleton entity — every room must create one in its setup()');
  }
  const [entityId] = match;
  return {
    get: (flag) => world.get(entityId, Flags)?.values[flag] ?? false,
    set: (flag, value) => {
      const current = world.get(entityId, Flags) ?? { values: {} };
      world.set(entityId, Flags, { values: { ...current.values, [flag]: value } });
    },
  };
}
