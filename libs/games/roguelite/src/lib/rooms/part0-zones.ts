import { ZONE_CLEARED_FLAG } from '../combat/combat-systems.js';
import { spawnSentinelAwakened, spawnSentinelMelee } from '../combat/spawn-combat-player.js';
import type { RoomExit } from '../components.js';
import { DUNGEON_LIGHTING } from '../lighting/dungeon-lighting.js';
import { buildGrayboxRoom, type GrayboxRows } from './graybox-room.js';
import type { RoomDefinition, RoomPopulateContext } from './room-types.js';

type Spawns = Readonly<Record<string, readonly { x: number; y: number }[]>>;
type ZonePopulate = (world: Parameters<RoomDefinition['populate']>[0], ctx: RoomPopulateContext, spawns: Spawns) => void;

/**
 * Part 0 Zones 4, 6 and 7 as Phase 1 graybox rooms (combat spec v1 §9),
 * chained zone-4 -> zone-6 -> zone-7 -> back to zone-4. Ember player, Part 0
 * lighting (all cold), no UI. Layouts are ASCII (see graybox-room.ts) until
 * the zones are laid out in Tiled. Open one directly with ?room=zone-6 etc.
 */

/** Zone 4 "first danger": a one-tile corridor through sleeping sentinels — walking gets you caught in the pockets; dashing through them (travel passes enemies) is the way. */
const ZONE_4: GrayboxRows = [
  '##############################',
  '######.......######.......####',
  '#E.......a..........a....a...X',
  '######.......######.......####',
  '##############################',
];

/** Zone 6 "first imprint": one slow-windup melee sentinel; the exit opens after one parry (spec §9, easy version). */
const ZONE_6: GrayboxRows = [
  '#####XX#####',
  '#....m.....#',
  '#..........#',
  '#..........#',
  '#..........#',
  '#..........#',
  '#....E.....#',
  '############',
];

/** Zone 7 "first success": two standard melee sentinels attacking out of step; two parries each. */
const ZONE_7: GrayboxRows = [
  '#######XX#######',
  '#..............#',
  '#...m......m...#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#.......E......#',
  '################',
];

function combatOf(ctx: RoomPopulateContext, roomId: string) {
  if (!ctx.combat) throw new Error(`room "${roomId}" needs the combat data.`);
  return ctx.combat;
}

function zoneRoom(id: string, rows: GrayboxRows, next: string, locked: boolean, populate: ZonePopulate): RoomDefinition {
  const room = buildGrayboxRoom(id, rows);
  const exits: RoomExit[] = room.exitZone
    ? [
        {
          id: 'onward',
          zone: room.exitZone,
          targetRoomId: next,
          targetEntryId: 'start',
          ...(locked ? { lockedUnless: { kind: 'flag' as const, flag: ZONE_CLEARED_FLAG } } : {}),
        },
      ]
    : [];
  return { id, tiles: room.tiles, entryPoints: room.entryPoints, exits, lighting: DUNGEON_LIGHTING, player: 'ember', populate: (world, ctx) => populate(world, ctx, room.spawns) };
}

export const zone4 = zoneRoom('zone-4', ZONE_4, 'zone-6', false, (world, _ctx, spawns) => {
  for (const at of spawns['a'] ?? []) spawnSentinelAwakened(world, at);
});

export const zone6 = zoneRoom('zone-6', ZONE_6, 'zone-7', true, (world, ctx, spawns) => {
  const tuning = combatOf(ctx, 'zone-6').zones.zone6;
  for (const at of spawns['m'] ?? []) {
    spawnSentinelMelee(world, at, {
      parriesToStop: tuning.parriesToStop,
      windupF: tuning.windupF,
      cueF: tuning.cueF,
      startDelayF: 60,
      assist: { baseCueF: tuning.cueF, fromAttempt: tuning.assistFromAttempt, stepF: tuning.assistStepF, maxCueF: tuning.assistMaxCueF },
    });
  }
});

export const zone7 = zoneRoom('zone-7', ZONE_7, 'zone-4', true, (world, ctx, spawns) => {
  const tuning = combatOf(ctx, 'zone-7').zones.zone7;
  (spawns['m'] ?? []).forEach((at, i) => {
    spawnSentinelMelee(world, at, { parriesToStop: tuning.parriesToStop, startDelayF: tuning.startDelaysF[i % tuning.startDelaysF.length] });
  });
});

export const PART0_ZONES = [zone4, zone6, zone7] as const;

/**
 * Casting test room (combat spec v1 §4-5, planning P-005): the child form
 * against one standard melee sentinel with health that comes back after it's
 * beaten — parry for embers, cast in the stun window or spend an ember to
 * cast instantly. Not part of Part 0; open with ?room=cast-lab.
 */
const CAST_LAB: GrayboxRows = [
  '##################',
  '#................#',
  '#................#',
  '#........m.......#',
  '#................#',
  '#................#',
  '#................#',
  '#................#',
  '#........E.......#',
  '##################',
];

export const castLab: RoomDefinition = (() => {
  const room = buildGrayboxRoom('cast-lab', CAST_LAB);
  return {
    id: 'cast-lab',
    tiles: room.tiles,
    entryPoints: room.entryPoints,
    exits: [],
    lighting: DUNGEON_LIGHTING,
    player: 'child',
    populate: (world, ctx) => {
      const combat = combatOf(ctx, 'cast-lab');
      for (const at of room.spawns['m'] ?? []) {
        spawnSentinelMelee(world, at, { hp: combat.enemies['sentinel-melee'].hp, reviveF: combat.castLab.sentinelReviveF, startDelayF: 60 });
      }
    },
  };
})();
