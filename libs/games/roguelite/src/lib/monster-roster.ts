import type { SpriteAnimation, TextureHandle } from '@g-game-farm/engine';
import type { RogueliteAssetKey } from './assets.js';
import { createDoltanPoseClip, createGhostPoseClip, createGrassPoseClip, createZagPoseClip } from './monster-clips.js';

export interface MonsterRosterEntry {
  readonly assetKey: RogueliteAssetKey;
  /** World units/sec — old pre-engine repo's per-monster `stat.speed`. */
  readonly speed: number;
  /** World units, relative to the player's spawn point. */
  readonly spawnOffset: { readonly x: number; readonly y: number };
  /** Old pre-engine repo's per-species bodyColliderConfig — the box actually used for combat hit-checks (not colliderConfig/'base', which is movement-blocking). */
  readonly hitbox: { readonly offsetX: number; readonly offsetY: number; readonly width: number; readonly height: number };
  readonly createPoseClip: (texture: TextureHandle) => Record<string, SpriteAnimation>;
}

/**
 * One entry per monster type this step ports. Spawn offsets scatter the 4
 * monsters around the player's spawn point, comfortably inside the initial
 * camera view (960x540 canvas @ zoom 4 -> 240x135 world units visible) so
 * all 4 are on-screen approaching the player from boot, not appearing
 * abruptly or starting stacked on each other.
 */
export const MONSTER_ROSTER: readonly MonsterRosterEntry[] = [
  {
    assetKey: 'zag',
    speed: 35,
    spawnOffset: { x: 0, y: -60 },
    hitbox: { offsetX: 1, offsetY: 9, width: 14, height: 6 },
    createPoseClip: createZagPoseClip,
  },
  {
    assetKey: 'doltan',
    speed: 15,
    spawnOffset: { x: 0, y: 60 },
    hitbox: { offsetX: 2, offsetY: 7, width: 9, height: 6 },
    createPoseClip: createDoltanPoseClip,
  },
  {
    assetKey: 'ghost',
    speed: 25,
    spawnOffset: { x: -60, y: 0 },
    hitbox: { offsetX: 2, offsetY: 4, width: 11, height: 8 },
    createPoseClip: createGhostPoseClip,
  },
  {
    assetKey: 'grass',
    speed: 15,
    spawnOffset: { x: 60, y: 0 },
    hitbox: { offsetX: 5, offsetY: 5, width: 6, height: 6 },
    createPoseClip: createGrassPoseClip,
  },
];
