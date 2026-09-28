import { createScenarioState, type AABB, type ScenarioCommand } from '@g-game-farm/ribs';
import { ScenarioRunner, type RoomEntryPoint, type RoomExit } from '../components.js';
import type { RogueliteScenarioCommand } from '../scenario/scenario-commands.js';
import { buildRectRoomLayout, cellPosition, type RectRoomConfig } from './tile-layout.js';
import type { RoomDefinition } from './room-types.js';

/** Door leading to room-b: two cells of the east wall, straddling world y=0. */
const DOOR_CELLS = [
  { column: 31, row: 15 },
  { column: 31, row: 16 },
] as const;

/** 32x32 cells centered on world-origin (-256..256) — monster waves scatter within world-constants.ts's WORLD_SIZE box, which fits inside. Floor tileId 0 (brown), wall tileId 10 (rock). */
const ROOM: RectRoomConfig = { columns: 32, rows: 32, originX: -256, originY: -256, floorTileId: 0, wallTileId: 10, doorways: DOOR_CELLS };

const tiles = buildRectRoomLayout(ROOM);

const entryPoints: readonly RoomEntryPoint[] = [{ id: 'start', position: { x: -9, y: -9 } }];

const doorTopLeft = cellPosition(ROOM, DOOR_CELLS[0]); // (240, -16)
const doorZone: AABB = { x: doorTopLeft.x - 5, y: doorTopLeft.y - 5, width: 40, height: 40 };
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
