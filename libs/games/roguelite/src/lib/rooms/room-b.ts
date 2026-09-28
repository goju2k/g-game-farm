import { createScenarioState, type ScenarioCommand } from '@g-game-farm/ribs';
import { Pickup, Position, ScenarioRunner, SpriteRender, type RoomEntryPoint, type RoomExit } from '../components.js';
import type { RogueliteScenarioCommand } from '../scenario/scenario-commands.js';
import { buildRectRoomLayout, cellPosition, type RectRoomConfig } from './tile-layout.js';
import type { RoomDefinition } from './room-types.js';

const GAMEPLAY_LAYER = 'gameplay';

/** Door onward to room-c: two cells of the east wall, straddling world y=0. */
const DOOR_CELLS = [
  { column: 15, row: 7 },
  { column: 15, row: 8 },
] as const;

/** A deliberately different size than room-a's (16x16 cells, -128..128) — proves the builder isn't tied to one config. */
const ROOM: RectRoomConfig = { columns: 16, rows: 16, originX: -128, originY: -128, floorTileId: 0, wallTileId: 10, doorways: DOOR_CELLS };

const tiles = buildRectRoomLayout(ROOM);

const entryPoints: readonly RoomEntryPoint[] = [{ id: 'fromRoomA', position: { x: -95, y: -9 } }];

const doorTopLeft = cellPosition(ROOM, DOOR_CELLS[0]); // (112, -16)
const exits: readonly RoomExit[] = [
  {
    id: 'toRoomC',
    zone: { x: doorTopLeft.x - 5, y: doorTopLeft.y - 5, width: 40, height: 40 },
    targetRoomId: 'room-c',
    targetEntryId: 'fromRoomB',
    // Onward only once the robe (and with it the mage form) has been taken.
    lockedUnless: { kind: 'flag', flag: 'robeTaken' },
  },
];

const ROOM_B_PROGRAM: readonly ScenarioCommand<RogueliteScenarioCommand>[] = [
  { type: 'wait', ms: 400 },
  { type: 'custom', command: { kind: 'showDialogue', text: '...an ancient seal cracks further.' } },
  { type: 'waitUntil', condition: { kind: 'flag', flag: 'robeTaken' } },
  { type: 'custom', command: { kind: 'transformPlayer', form: 'mage' } },
];

/**
 * The demo's second room: an NPC line plays automatically, then
 * touching the robe pickup sets 'robeTaken' and the script transforms the
 * player from the flame form into the mage form — the slice's proof that
 * spawn and scripted transform share spritePropsForForm without drifting.
 * Both the NPC and the robe are undecorated placeholder blocks (tinted
 * whitePixelTexture, same idiom as the basic-attack projectile) — no new
 * art, per this slice's placeholder-asset convention. Taking the robe also
 * unlocks the east door into room-c (the first Tiled-authored room).
 */
export const roomB: RoomDefinition = {
  id: 'room-b',
  tiles,
  exits,
  entryPoints,
  populate: (world, ctx) => {
    const npc = world.createEntity();
    world.set(npc, Position, { x: 20, y: -9 });
    world.set(npc, SpriteRender, {
      texture: ctx.whitePixelTexture,
      layer: GAMEPLAY_LAYER,
      sx: 0,
      sy: 0,
      sWidth: 1,
      sHeight: 1,
      width: 16,
      height: 16,
      tint: [80, 160, 255, 255],
    });

    const robe = world.createEntity();
    world.set(robe, Position, { x: 60, y: -6 });
    world.set(robe, SpriteRender, {
      texture: ctx.whitePixelTexture,
      layer: GAMEPLAY_LAYER,
      sx: 0,
      sy: 0,
      sWidth: 1,
      sHeight: 1,
      width: 12,
      height: 12,
      tint: [230, 190, 40, 255],
    });
    world.set(robe, Pickup, { flag: 'robeTaken' });

    const runner = world.createEntity();
    world.set(runner, ScenarioRunner, { program: ROOM_B_PROGRAM, state: createScenarioState() });
  },
};
