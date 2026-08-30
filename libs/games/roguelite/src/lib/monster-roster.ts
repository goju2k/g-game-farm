import type { SpriteAnimation, TextureHandle } from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from './assets.js';
import { createDoltanPoseClip, createGhostPoseClip, createGrassPoseClip, createZagPoseClip } from './monster-clips.js';

export interface MonsterRosterEntry {
  readonly assetKey: RogueliteAssetKey;
  /** World units/sec — old pre-engine repo's per-monster `stat.speed`. */
  readonly speed: number;
  /** Old pre-engine repo's per-species bodyColliderConfig — the box actually used for combat hit-checks (not colliderConfig/'base', which is movement-blocking). */
  readonly hitbox: { readonly offsetX: number; readonly offsetY: number; readonly width: number; readonly height: number };
  readonly createPoseClip: (texture: TextureHandle) => Record<string, SpriteAnimation>;
}

/**
 * One entry per monster type this step ports. Spawn POSITIONS are not data
 * here — see monster-wave.ts's spawnMonsterWave(), which scatters every
 * spawned monster randomly across world-constants.ts's WORLD_SIZE box (old
 * pre-engine repo's generateMonster()), not a fixed offset from a point.
 * Array order (zag/doltan/ghost/grass) has no gameplay effect —
 * spawnMonsterWave never calls World.query() during spawn, so
 * entity-creation order here doesn't interact with anything — kept as
 * originally chosen in step 4, not reordered to match the old source's
 * doltan/ghost/zag/grass call order.
 */
export const MONSTER_ROSTER: readonly MonsterRosterEntry[] = [
  {
    assetKey: 'zag',
    speed: 35,
    hitbox: { offsetX: 1, offsetY: 9, width: 14, height: 6 },
    createPoseClip: createZagPoseClip,
  },
  {
    assetKey: 'doltan',
    speed: 15,
    hitbox: { offsetX: 2, offsetY: 7, width: 9, height: 6 },
    createPoseClip: createDoltanPoseClip,
  },
  {
    assetKey: 'ghost',
    speed: 25,
    hitbox: { offsetX: 2, offsetY: 4, width: 11, height: 8 },
    createPoseClip: createGhostPoseClip,
  },
  {
    assetKey: 'grass',
    speed: 15,
    hitbox: { offsetX: 5, offsetY: 5, width: 6, height: 6 },
    createPoseClip: createGrassPoseClip,
  },
];
