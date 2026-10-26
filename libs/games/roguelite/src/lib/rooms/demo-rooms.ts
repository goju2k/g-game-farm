import type { World } from '@g-game-farm/ribs';
import { LIGHT_MOTION } from '../lighting/light-motion.js';
import { spawnSentinelAwakened, spawnSentinelMelee } from '../combat/spawn-combat-player.js';
import { TileLight } from '../components.js';
import { spawnVineSprites } from '../events/event-art.js';
import { Vine } from '../events/event-components.js';
import { COLD_LIGHT, DUNGEON_LIGHTING } from '../lighting/dungeon-lighting.js';
import type { RogueliteSession } from '../session.js';
import { setCells, spanOf, spawnWallCrystal, spawnBrazier, spawnCrackedWall, spawnPedestal, spawnSealDoor, spawnSkillPickup, spawnTrace } from '../world/world-systems.js';
import { buildGrayboxRoom, cellOf, decorBlock, linkExits, type ExitLink, type GrayboxDecor, type GrayboxRows } from './graybox-room.js';
import { ROOM_TILE_SIZE } from './tile-layout.js';
import type { RoomDefinition, RoomPopulateContext } from './room-types.js';

/**
 * The friends' demo map (demo level design 31, D-034): Part 0's two dead
 * ends (scar, tablet) and Part 1's first floor — a small hub maze: light
 * two braziers (west, north) to open the hub's seal door east, through the
 * mixed arena to the boss. Graybox ASCII (graybox-room.ts: digits are
 * numbered exits/entries). Combat corridors are 3+ tiles (D-032). Enemy
 * counts are first guesses (D-033).
 *
 * Progress outlives rooms in session.flags: brazier-w / brazier-n (lit),
 * vine-* (burnt), crack-room3 (broken); the pillar is the "pillar" skill.
 */

export const DEMO_FLAGS = {
  brazierWest: 'brazier-w',
  brazierNorth: 'brazier-n',
  crack: 'crack-room3',
  vineHub: 'vine-hub-north',
  vineMural: 'vine-room1-mural',
  vineWest: 'vine-room1-west',
} as const;

/** Event actor ids of the examinable things — the planning room's interact events target these. */
export const DEMO_ACTORS = {
  scar: 'trace-scar',
  tablet: 'trace-tablet',
  mural: 'trace-mural',
  crack: 'trace-crack',
  pedestal: 'pedestal',
} as const;

/** Part 0 light with its own ambient (31 §3). */
function ambient(level: number): RoomDefinition['lighting'] {
  return { ...DUNGEON_LIGHTING, settings: { ...DUNGEON_LIGHTING.settings, ambient: [level, level, Math.min(1, level * 1.1)] } };
}

type Points = Readonly<Record<string, readonly { x: number; y: number }[]>>;

interface DemoRoomSpec {
  readonly rows: GrayboxRows;
  /** Tileset tiles drawn over the room (traces, the seal mark, remains — dungeon-part0 v4 tile ids). */
  readonly decor?: readonly GrayboxDecor[];
  readonly player: 'ember' | 'child';
  readonly links: Readonly<Record<string, ExitLink>>;
  readonly ambient: number;
  readonly checkpoint?: boolean;
  readonly populate?: (world: World, ctx: RoomPopulateContext, at: Points) => void;
}

function demoRoom(id: string, spec: DemoRoomSpec): RoomDefinition {
  const room = buildGrayboxRoom(id, spec.rows, spec.decor);
  const points: Record<string, { x: number; y: number }> = {};
  for (const [letter, cells] of Object.entries(room.spawns)) if (cells[0]) points[letter] = cells[0];
  return {
    id,
    tiles: room.tiles,
    entryPoints: room.entryPoints,
    exits: linkExits(id, room, spec.links),
    lighting: ambient(spec.ambient),
    player: spec.player,
    eventSpace: { points, areas: room.areas },
    ...(spec.checkpoint === false ? { checkpoint: false } : {}),
    populate: (world, ctx) => {
      // L: seal lamps (cold).
      for (const at of room.spawns['L'] ?? []) world.set(world.createEntity(), TileLight, { x: at.x, y: at.y, tint: COLD_LIGHT, radii: [38], motion: LIGHT_MOTION.sealLamp });
      // K: a seal crystal on the top wall above (spawnWallCrystal).
      for (const at of room.spawns['K'] ?? []) spawnWallCrystal(world, at);
      spec.populate?.(world, ctx, room.spawns);
    },
  };
}

/** Vines over the marker cells (solid until burnt); `hits` to burn; gone already if burnt this run. */
export function spawnVines(world: World, session: RogueliteSession, points: readonly { x: number; y: number }[] | undefined, flag: string, hits = 1): void {
  if (!points || points.length === 0 || session.flags.has(flag)) return;
  const span = spanOf(points);
  setCells(world, span.cells, true);
  world.set(world.createEntity(), Vine, { cells: span.cells, box: span.box, touching: false, sprites: spawnVineSprites(world, span.cells), progressFlag: flag, ...(hits > 1 ? { hitsLeft: hits } : {}) });
}

/** dungeon-part0 v4 tiles (its .tsj names). */
const TILES = {
  scratchedWall: [
    [70, 71],
    [80, 81],
  ],
  brokenTablet: [[72], [82]],
  muralPeople: [
    [73, 74],
    [83, 84],
  ],
  muralSmallLight: [
    [75, 76],
    [85, 86],
  ],
  sealMark: [
    [34, 35],
    [44, 45],
  ],
  remains: [
    [36, 37],
    [46, 47],
  ],
} as const;

/** A 2x2 wall trace drawn on the two wall rows above the marker; it's examined at the wall's foot. */
function wallTrace(rows: GrayboxRows, marker: string, tiles: readonly (readonly number[])[]): { decor: GrayboxDecor[]; foot: { x: number; y: number } | undefined } {
  const at = cellOf(rows, marker);
  if (!at) return { decor: [], foot: undefined };
  return { decor: decorBlock({ column: at.column, row: at.row - 2 }, tiles), foot: { x: (at.column + 1) * ROOM_TILE_SIZE, y: at.row * ROOM_TILE_SIZE } };
}

const melee = (world: World, ctx: RoomPopulateContext, points: readonly { x: number; y: number }[] | undefined) => {
  const hp = ctx.combat?.enemies['sentinel-melee'].hp;
  (points ?? []).forEach((at, i) => spawnSentinelMelee(world, at, { ...(hp !== undefined ? { hp } : {}), startDelayF: 60 + i * 40 }));
};
const awakened = (world: World, points: readonly { x: number; y: number }[] | undefined) => {
  for (const at of points ?? []) spawnSentinelAwakened(world, at);
};

// ---------------- Part 0: dead ends ----------------

/** Dead end ①, left of the glimmer's fork: a scratched wall (over s), a sentinel's remains (r). Dark. */
const SCAR: GrayboxRows = [
  '########', //
  '########',
  '#..s...#',
  '#......#',
  '#...r..#',
  '#......#',
  '#.E....#',
  '##111###',
];
const scarTrace = wallTrace(SCAR, 's', TILES.scratchedWall);
export const scar = demoRoom('scar', {
  rows: SCAR,
  decor: [...scarTrace.decor, ...decorBlock(cellOf(SCAR, 'r'), TILES.remains)],
  player: 'ember',
  links: { '1': { room: 'opening-glimmer', entry: '1' } },
  ambient: 0.1,
  checkpoint: false,
  populate: (world) => {
    if (scarTrace.foot) spawnTrace(world, scarTrace.foot, DEMO_ACTORS.scar, 'tiles', 'rec-scar');
  },
});

/** Dead end ②, up from a Zone 4 pocket: a broken tablet (standing on t) under a seal lamp. */
const TABLET: GrayboxRows = [
  '#######', //
  '#.....#',
  '#..t..#',
  '#..L..#',
  '#.....#',
  '#..E..#',
  '##111##',
];
const tabletAt = cellOf(TABLET, 't');
export const tablet = demoRoom('tablet', {
  rows: TABLET,
  decor: decorBlock(tabletAt && { column: tabletAt.column, row: tabletAt.row - 1 }, TILES.brokenTablet),
  player: 'ember',
  links: { '1': { room: 'zone-4', entry: '1' } },
  ambient: 0.18,
  checkpoint: false,
  populate: (world) => {
    if (tabletAt) spawnTrace(world, { x: (tabletAt.column + 0.5) * ROOM_TILE_SIZE, y: (tabletAt.row + 1) * ROOM_TILE_SIZE }, DEMO_ACTORS.tablet, 'tiles', 'rec-tablet');
  },
});

// ---------------- Part 1: the first floor ----------------

/**
 * The hub: north-west the shrine past a 3-layer vine door (V); west room-1;
 * north-east the seal door (D) — in the north wall, where the art faces the
 * camera — with a brazier pedestal either side (p: west's, then north's);
 * the big seal mark in the middle (o). Checkpoint.
 */
const HUB: GrayboxRows = [
  '###111######333###',
  '###VVV######DDD###',
  '#K......K..p...p.#',
  '#................#',
  '2................#',
  '2.......o........#',
  '2................#',
  '#................#',
  '#................#',
  '#................#',
  '#.......E........#',
  '##################',
];
export const hub = demoRoom('hub', {
  rows: HUB,
  decor: decorBlock(cellOf(HUB, 'o'), TILES.sealMark),
  player: 'child',
  links: { '1': { room: 'shrine', entry: '1' }, '2': { room: 'room-1', entry: '1' }, '3': { room: 'room-3', entry: '1' } },
  ambient: 0.3,
  populate: (world, ctx, at) => {
    spawnVines(world, ctx.session, at['V'], DEMO_FLAGS.vineHub, 3);
    spawnSealDoor(world, at['D'] ?? [], [DEMO_FLAGS.brazierWest, DEMO_FLAGS.brazierNorth], ctx.session);
    const [west, north] = at['p'] ?? [];
    if (west) spawnPedestal(world, west, DEMO_FLAGS.brazierWest, ctx.session);
    if (north) spawnPedestal(world, north, DEMO_FLAGS.brazierNorth, ctx.session);
    if (at['o']?.[0]) world.set(world.createEntity(), TileLight, { x: at['o'][0].x + 8, y: at['o'][0].y + 8, tint: COLD_LIGHT, radii: [32], motion: LIGHT_MOTION.sealGlyph });
  },
});

/** West: quick spell only — three sleepers (a), vines across the way to the mural (V) and to the brazier (U). */
export const room1 = demoRoom('room-1', {
  rows: [
    '#####333############',
    '#####VVV############',
    '#...........K......#',
    '#....a.............#',
    '2.U................1',
    '2.U......a.........1',
    '2.U................1',
    '#..................#',
    '#.......a..........#',
    '####################',
  ],
  player: 'child',
  links: { '1': { room: 'hub', entry: '2' }, '2': { room: 'brazier-w', entry: '1' }, '3': { room: 'mural', entry: '1' } },
  ambient: 0.26,
  checkpoint: false,
  populate: (world, ctx, at) => {
    awakened(world, at['a']);
    spawnVines(world, ctx.session, at['V'], DEMO_FLAGS.vineMural);
    spawnVines(world, ctx.session, at['U'], DEMO_FLAGS.vineWest);
  },
});

/** The west brazier (b); lit, its warmth runs back east toward the hub. */
export const brazierWest = demoRoom('brazier-w', {
  rows: [
    '######', //
    '#....#',
    '#.b..1',
    '#....1',
    '#....1',
    '######',
  ],
  player: 'child',
  links: { '1': { room: 'room-1', entry: '2' } },
  ambient: 0.22,
  checkpoint: false,
  populate: (world, ctx, at) => {
    if (at['b']?.[0]) spawnBrazier(world, at['b'][0], DEMO_FLAGS.brazierWest, ctx.session, [{ x: 4.5 * 16, y: 4.5 * 16 }, { x: 6.5 * 16, y: 4.5 * 16 }]);
  },
});

/** Dead end off room-1: the mural of people around a great light (on the wall over m). */
const MURAL: GrayboxRows = [
  '########', //
  '########',
  '#..m...#',
  '#......#',
  '#......#',
  '##111###',
];
const muralTrace = wallTrace(MURAL, 'm', TILES.muralPeople);
export const mural = demoRoom('mural', {
  rows: MURAL,
  decor: muralTrace.decor,
  player: 'child',
  links: { '1': { room: 'room-1', entry: '3' } },
  ambient: 0.2,
  checkpoint: false,
  populate: (world) => {
    if (muralTrace.foot) spawnTrace(world, muralTrace.foot, DEMO_ACTORS.mural, 'tiles', 'rec-mural');
  },
});

/** North, past the vine door: the pillar on its pedestal (k). Checkpoint. */
export const shrine = demoRoom('shrine', {
  rows: [
    '##########',
    '#.K....K.#',
    '#...k....#',
    '#........2',
    '#........2',
    '#........2',
    '#........#',
    '###111####',
  ],
  player: 'child',
  links: { '1': { room: 'hub', entry: '1' }, '2': { room: 'room-2', entry: '1' } },
  ambient: 0.34,
  populate: (world, ctx, at) => {
    if (at['k']?.[0]) spawnSkillPickup(world, at['k'][0], DEMO_ACTORS.pedestal, 'pillar', ctx.session);
  },
});

/** Two melee sentinels (m): parry, then combo and cast. */
export const room2 = demoRoom('room-2', {
  rows: [
    '################',
    '#...K......K...#',
    '#.....m........#',
    '1..............2',
    '1..............2',
    '1..............2',
    '#.........m....#',
    '#..............#',
    '#..............#',
    '################',
  ],
  player: 'child',
  links: { '1': { room: 'shrine', entry: '2' }, '2': { room: 'brazier-n', entry: '1' } },
  ambient: 0.26,
  checkpoint: false,
  populate: (world, ctx, at) => melee(world, ctx, at['m']),
});

/** The north brazier (b); its warmth runs back west. */
export const brazierNorth = demoRoom('brazier-n', {
  rows: [
    '######', //
    '#....#',
    '1..b.#',
    '1....#',
    '1....#',
    '######',
  ],
  player: 'child',
  links: { '1': { room: 'room-2', entry: '2' } },
  ambient: 0.22,
  checkpoint: false,
  populate: (world, ctx, at) => {
    if (at['b']?.[0]) spawnBrazier(world, at['b'][0], DEMO_FLAGS.brazierNorth, ctx.session, [{ x: 1.5 * 16, y: 4.5 * 16 }, { x: -0.5 * 16, y: 4.5 * 16 }]);
  },
});

/**
 * East, past the seal door: the mixed arena — three sleepers (a) and two
 * melee sentinels (m). The cracked wall (C, 2 tiles: the art is 32px; a hidden
 * way, not a combat corridor) in the north wall hides a room. Its event
 * script locks it on entry and opens it on "cleared". Checkpoint.
 */
export const room3 = demoRoom('room-3', {
  rows: [
    '##############33####',
    '##############CC####',
    '#...K....K.........#',
    '#...a........a.....#',
    '#..................2',
    '#........m.........2',
    '#..................2',
    '#..................#',
    '#.....m......a.....#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '########111#########',
  ],
  player: 'child',
  links: { '1': { room: 'hub', entry: '3' }, '2': { room: 'ante', entry: '1' }, '3': { room: 'crack', entry: '1' } },
  ambient: 0.28,
  populate: (world, ctx, at) => {
    awakened(world, at['a']);
    melee(world, ctx, at['m']);
    spawnCrackedWall(world, at['C'] ?? [], DEMO_FLAGS.crack, ctx.session);
  },
});

/** The hidden room behind the cracked wall: a mural of one small light (on the wall over c). */
const CRACK: GrayboxRows = [
  '#######', //
  '#######',
  '#.c...#',
  '#.....#',
  '#.....#',
  '#.....#',
  '##11###',
];
const crackTrace = wallTrace(CRACK, 'c', TILES.muralSmallLight);
export const crack = demoRoom('crack', {
  rows: CRACK,
  decor: crackTrace.decor,
  player: 'child',
  links: { '1': { room: 'room-3', entry: '3' } },
  ambient: 0.2,
  checkpoint: false,
  populate: (world) => {
    if (crackTrace.foot) spawnTrace(world, crackTrace.foot, DEMO_ACTORS.crack, 'tiles', 'rec-crack');
  },
});

/** Before the boss: quiet, four seal lamps. Checkpoint. */
export const ante = demoRoom('ante', {
  rows: [
    '##########',
    '#K......K#',
    '#........#',
    '1........2',
    '1........2',
    '1........2',
    '#L......L#',
    '##########',
  ],
  player: 'child',
  links: { '1': { room: 'room-3', entry: '2' }, '2': { room: 'boss', entry: '1' } },
  ambient: 0.22,
});

/** The guardian larva's room (the boss comes with its own spec). */
export const boss = demoRoom('boss', {
  rows: [
    '######################',
    ...Array.from({ length: 14 }, (_, r) => (r >= 5 && r <= 7 ? '1' : '#') + '.'.repeat(20) + '#'),
    '######################',
  ],
  player: 'child',
  links: { '1': { room: 'ante', entry: '2' } },
  ambient: 0.3,
  checkpoint: false,
});

export const DEMO_ROOMS = [scar, tablet, hub, room1, brazierWest, mural, shrine, room2, brazierNorth, room3, crack, ante, boss] as const;
