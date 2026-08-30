import { createScenarioState, type AABB, type ScenarioCommand } from '@g-game-farm/ribs';
import { RoomTileLayout, ScenarioRunner, type RoomEntryPoint, type RoomExit } from '../components.js';
import type { RogueliteScenarioCommand } from '../scenario/scenario-commands.js';
import { buildBorderWallTiles, buildFloorTiles, buildWallColliders, type RoomGridConfig } from './tile-layout.js';
import type { RoomDefinition } from './room-types.js';

/** Same 32x32 grid the original single-room slice used — see world-constants.ts's WORLD_SIZE doc comment. */
const GRID: RoomGridConfig = { gridWidth: 32, gridHeight: 32, tileSpacing: 15, tileSpriteSize: 16, originX: -240, originY: -240 };

/** East wall, two rows near the middle (world y -15 and 0) — the door leading to room-b. */
const DOOR_X = -240 + 31 * 15; // 225 — the east border column
const DOOR_Y_TOP = -15;
const DOOR_Y_BOTTOM = 0;

const floorTiles = buildFloorTiles(GRID);
const allWallTiles = buildBorderWallTiles(GRID);
const wallTiles = allWallTiles.filter(
  (tile) => !(tile.x === DOOR_X && (tile.y === DOOR_Y_TOP || tile.y === DOOR_Y_BOTTOM)),
);
const wallColliders = buildWallColliders(wallTiles, GRID.tileSpriteSize);

const tiles: RoomTileLayout = { floorTiles, wallTiles, wallColliders };

const entryPoints: readonly RoomEntryPoint[] = [{ id: 'start', position: { x: -9, y: -9 } }];

const doorZone: AABB = { x: DOOR_X - 5, y: DOOR_Y_TOP - 5, width: 40, height: 40 };
const exits: readonly RoomExit[] = [
  {
    id: 'toRoomB',
    zone: doorZone,
    targetRoomId: 'room-b',
    targetEntryId: 'fromRoomA',
    lockedUnless: { kind: 'flag', flag: 'cleared' },
  },
];

const ROOM_A_PROGRAM: readonly ScenarioCommand<RogueliteScenarioCommand>[] = [
  { type: 'custom', command: { kind: 'spawnWave', count: 3 } },
  { type: 'custom', command: { kind: 'waitForNoMonsters' } },
  { type: 'setFlag', flag: 'cleared', value: true },
];

/**
 * The demo's first room: clear a wave of monsters to unlock the east door
 * into room-b. No NPCs/pickups here — this room's only job is validating
 * "spawnWave -> waitForNoMonsters -> setFlag -> lockedUnless door" end to
 * end.
 */
export const roomA: RoomDefinition = {
  id: 'room-a',
  tiles,
  exits,
  entryPoints,
  populate: (world) => {
    const runner = world.createEntity();
    world.set(runner, ScenarioRunner, { program: ROOM_A_PROGRAM, state: createScenarioState() });
  },
};
