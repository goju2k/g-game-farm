import { spawnSentinelMelee } from '../combat/spawn-combat-player.js';
import { DUNGEON_LIGHTING } from '../lighting/dungeon-lighting.js';
import { spawnTileLights } from '../lighting/tile-lights.js';
import { dungeonPart0SampleTileMap } from './maps/dungeon-part0-sample.generated.js';
import type { RoomDefinition } from './room-types.js';
import { roomDataFromTileMap } from './tiled-room.js';

const ROOM_ID = 'arena';
const { tiles, entryPoints } = roomDataFromTileMap(ROOM_ID, dungeonPart0SampleTileMap);

/**
 * Combat graybox arena (combat spec v1, Phase 1): the ember player against
 * one standard melee sentinel, in the Part 0 dungeon with its lighting.
 * Free practice — the sentinel never stops; Zones 4/6/7 get their own
 * tuned rooms. Open with ?room=arena. The sample map's exits are dropped:
 * this room is a sandbox, not part of a route.
 */
export const roomArena: RoomDefinition = {
  id: ROOM_ID,
  tiles,
  exits: [],
  entryPoints,
  lighting: DUNGEON_LIGHTING,
  player: 'ember',
  populate: (world, ctx) => {
    spawnTileLights(world, dungeonPart0SampleTileMap);
    spawnSentinelMelee(world, { x: ctx.entryPosition.x + 72, y: ctx.entryPosition.y - 6 }, { startDelayF: 60 });
  },
};
