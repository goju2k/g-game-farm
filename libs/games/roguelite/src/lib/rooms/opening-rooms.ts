import {
  COLLISION_SOLID,
  createCollisionGrid,
  type World,
} from '@g-game-farm/ribs';
import { RoomTileLayout, TileLight, type RoomExit } from '../components.js';
import { spawnVineSprites } from '../events/event-art.js';
import { Vine } from '../events/event-components.js';
import { COLD_LIGHT, DUNGEON_LIGHTING } from '../lighting/dungeon-lighting.js';
import { buildGrayboxRoom, type GrayboxRows } from './graybox-room.js';
import type { RoomDefinition } from './room-types.js';
import { ROOM_TILE_SIZE } from './tile-layout.js';

/**
 * The opening (planning 24_opening-script-v1): A wake -> B glimmer -> the
 * Zone 4/6/7 graybox -> C vista + D artifact -> E first meeting. Graybox
 * ASCII rooms; everything that happens in them is in
 * public/game/data/events/opening.json — these only provide the space,
 * named points (single letters) and trigger areas.
 */

function exitTo(
  zone: RoomExit['zone'] | undefined,
  target: string,
): RoomExit[] {
  return zone
    ? [{ id: 'onward', zone, targetRoomId: target, targetEntryId: 'start' }]
    : [];
}

/** Scene A (Zone 1): a small dark room, only part of it floor. */
const WAKE: GrayboxRows = [
  '##########',
  '###....###',
  '##......##',
  '#...E....X',
  '##......##',
  '###....###',
  '##########',
  '##########',
];

/** Scene B (Zone 3): a long corridor. m = the "midway" trigger, n = three cells before the end. */
const GLIMMER: GrayboxRows = [
  '########################',
  '#E.........m........n..X',
  '#..........m........n..X',
  '#..........m........n..X',
  '########################',
  '########################',
];

/** Scene E (Part 1): a brighter room, vines (V) across the way out. */
const MEET: GrayboxRows = [
  '################',
  '#............#.#',
  '#............#.#',
  '#............#.#',
  '#..E.........V.X',
  '#............V.X',
  '#............#.#',
  '#............#.#',
  '#............#.#',
  '################',
];

/**
 * Scenes C+D (Zones 8-9): a 3-wide corridor (from E) opens at v into a
 * 30x40 vertical hall; seal lamps (L) line both walls in tiers; the artifact
 * waits at A near the top, t is the camera's look-up target.
 */
function vistaRows(): GrayboxRows {
  const width = 30;
  const hallHeight = 40;
  const rows: string[] = ['#'.repeat(width)];
  for (let r = 1; r < hallHeight; r++) {
    const cells = ['#', ...'.'.repeat(width - 2), '#'];
    if (r >= 4 && (r - 4) % 8 === 0) {
      cells[1] = 'L';
      cells[width - 2] = 'L';
    }
    if (r === 3) cells[15] = 'A';
    if (r === 6) cells[15] = 't';
    rows.push(cells.join(''));
  }
  const corridor = (inner: string) =>
    '#'.repeat(13) + inner + '#'.repeat(width - 16);
  rows.push(
    corridor('vvv'),
    corridor('...'),
    corridor('...'),
    corridor('.E.'),
    '#'.repeat(width),
  );
  return rows;
}

const center = (cells: readonly { x: number; y: number }[] | undefined) =>
  cells?.[0];

function lampsAt(
  world: World,
  points: readonly { x: number; y: number }[] | undefined,
): void {
  for (const at of points ?? [])
    world.set(world.createEntity(), TileLight, {
      x: at.x,
      y: at.y,
      tint: COLD_LIGHT,
      radii: [38],
    });
}

function graybox(
  id: string,
  rows: GrayboxRows,
  next: string,
  extra: Partial<RoomDefinition> = {},
  extraPoints: Record<string, { x: number; y: number }> = {},
): RoomDefinition {
  const room = buildGrayboxRoom(id, rows);
  const points: Record<string, { x: number; y: number }> = { ...extraPoints };
  for (const [letter, cells] of Object.entries(room.spawns)) {
    const first = center(cells);
    if (first) points[letter] = first;
  }
  return {
    id,
    tiles: room.tiles,
    entryPoints: room.entryPoints,
    exits: exitTo(room.exitZone, next),
    lighting: DUNGEON_LIGHTING,
    player: 'ember',
    eventSpace: { points, areas: room.areas },
    populate: () => undefined,
    ...extra,
  };
}

export const openingWake = graybox('opening-wake', WAKE, 'opening-glimmer');

/** g: the far glimmer, high up behind the corridor's far end (outside the map: seen, never reached). */
export const openingGlimmer = graybox(
  'opening-glimmer',
  GLIMMER,
  'zone-4',
  {},
  { g: { x: 22 * ROOM_TILE_SIZE + 8, y: -1.5 * ROOM_TILE_SIZE } },
);

const vista = buildGrayboxRoom('opening-vista', vistaRows());
export const openingVista = graybox(
  'opening-vista',
  vistaRows(),
  'part1-meet',
  {
    populate: (world) => lampsAt(world, vista.spawns['L']),
  },
);

/** c: where the companion flies in from — off the top-right of the room. */
const meet = buildGrayboxRoom('part1-meet', MEET);
export const part1Meet = graybox(
  'part1-meet',
  MEET,
  'cast-lab',
  {
    player: 'child',
    populate: (world) => {
      // The vines are solid until burned (event-systems.ts createVineSystem).
      const cells = (meet.spawns['V'] ?? []).map((p) => ({
        column: Math.floor(p.x / ROOM_TILE_SIZE),
        row: Math.floor(p.y / ROOM_TILE_SIZE),
      }));
      const box = meet.areas['V'];
      if (!box || cells.length === 0) return;
      for (const [id, layout] of world.query([RoomTileLayout] as const)) {
        const grid = layout.collision;
        const solid = Array.from(grid.cells);
        for (const cell of cells)
          solid[cell.row * grid.columns + cell.column] = COLLISION_SOLID;
        world.set(id, RoomTileLayout, {
          ...layout,
          collision: createCollisionGrid({ ...grid, cells: solid }),
        });
      }
      world.set(world.createEntity(), Vine, { cells, box, touching: false, sprites: spawnVineSprites(world, cells) });
    },
  },
  { c: { x: 17 * ROOM_TILE_SIZE, y: -ROOM_TILE_SIZE } },
);

export const OPENING_ROOMS = [
  openingWake,
  openingGlimmer,
  openingVista,
  part1Meet,
] as const;
