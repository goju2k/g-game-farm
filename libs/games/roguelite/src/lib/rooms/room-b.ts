import { createScenarioState, type ScenarioCommand } from '@g-game-farm/ribs';
import { Pickup, Position, RoomTileLayout, ScenarioRunner, SpriteRender, type RoomEntryPoint, type RoomExit } from '../components.js';
import type { RogueliteScenarioCommand } from '../scenario/scenario-commands.js';
import { buildBorderWallTiles, buildFloorTiles, buildWallColliders, type RoomGridConfig } from './tile-layout.js';
import type { RoomDefinition } from './room-types.js';

const GAMEPLAY_LAYER = 'gameplay';

/**
 * A deliberately different-sized grid than room-a's (16x16 vs 32x32,
 * origin/spacing independent) — proves the tile-layout builders generalize
 * beyond the one config the old single-room slice happened to use.
 */
const GRID: RoomGridConfig = { gridWidth: 16, gridHeight: 16, tileSpacing: 15, tileSpriteSize: 16, originX: -120, originY: -120 };

const floorTiles = buildFloorTiles(GRID);
const wallTiles = buildBorderWallTiles(GRID);
const wallColliders = buildWallColliders(wallTiles, GRID.tileSpriteSize);

const tiles: RoomTileLayout = { floorTiles, wallTiles, wallColliders };

const entryPoints: readonly RoomEntryPoint[] = [{ id: 'fromRoomA', position: { x: -95, y: -9 } }];

const exits: readonly RoomExit[] = [];

const ROOM_B_PROGRAM: readonly ScenarioCommand<RogueliteScenarioCommand>[] = [
  { type: 'wait', ms: 400 },
  { type: 'custom', command: { kind: 'showDialogue', text: '...an ancient seal cracks further.' } },
  { type: 'waitUntil', condition: { kind: 'flag', flag: 'robeTaken' } },
  { type: 'custom', command: { kind: 'transformPlayer', form: 'mage' } },
];

/**
 * The demo's second and final room: an NPC line plays automatically, then
 * touching the robe pickup sets 'robeTaken' and the script transforms the
 * player from the flame form into the mage form — the slice's proof that
 * spawn and scripted transform share spritePropsForForm without drifting.
 * Both the NPC and the robe are undecorated placeholder blocks (tinted
 * whitePixelTexture, same idiom as the basic-attack projectile) — no new
 * art, per this slice's placeholder-asset convention.
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
