import { testTileMap } from './maps/test.generated.js';
import type { RoomDefinition } from './room-types.js';
import { roomDataFromTileMap } from './tiled-room.js';

const ROOM_ID = 'room-c';
const { tiles, entryPoints, exits } = roomDataFromTileMap(ROOM_ID, testTileMap);

/**
 * The first room authored in Tiled (maps/test.tmj) rather than built
 * procedurally: its artwork, collision, and entry point all come from the
 * map, converted at build time. An empty cave for now — nothing to
 * populate; reached through room-b's east door.
 */
export const roomC: RoomDefinition = {
  id: ROOM_ID,
  tiles,
  exits,
  entryPoints,
  populate: () => undefined,
};
