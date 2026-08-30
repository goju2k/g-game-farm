import type { SpriteAnimation, TextureHandle } from '@g-game-farm/ribs';
import { MONSTER_FRAME_SIZE } from './monster-constants.js';

/** name/texture/loop:true wrapper — every monster's pose clip loops forever. */
function buildPoseClip(
  name: string,
  texture: TextureHandle,
  frames: readonly { sx: number; sy: number; durationMs: number }[],
): SpriteAnimation {
  return { name, texture, loop: true, frames: frames.map((f) => ({ ...f, sWidth: MONSTER_FRAME_SIZE, sHeight: MONSTER_FRAME_SIZE })) };
}

/**
 * Per-species pose clip factories. Frame data ported verbatim from the old
 * pre-engine repo's AniMetaZag/Doltan/Ghost/Grass.ts `pose` blocks, combined
 * with Sprite.ts's 1-based row-major numbering (frame N -> row=floor((N-1)/
 * xcnt), col=(N-1)%xcnt -> pixel offset (col*16,row*16)).
 *
 * Each returns Record<string, SpriteAnimation>, NOT a named {pose:...}
 * interface — see player-clips.ts's doc comment for why (TS's implicit
 * index-signature exemption for Record<string,T> that a named interface
 * doesn't get; bit us for real in step 3).
 */

// Zag: 80x16 sheet, 5 cols/row. pose = tileNo 1,2,3, all row 0, 120ms each.
export function createZagPoseClip(texture: TextureHandle): Record<string, SpriteAnimation> {
  return {
    pose: buildPoseClip('roguelite:zag-pose', texture, [
      { sx: 0, sy: 0, durationMs: 120 },
      { sx: 16, sy: 0, durationMs: 120 },
      { sx: 32, sy: 0, durationMs: 120 },
    ]),
  };
}

// Doltan: 160x48 sheet, 10 cols/row. pose = tileNo 1..6, all row 0, 120ms each.
export function createDoltanPoseClip(texture: TextureHandle): Record<string, SpriteAnimation> {
  return {
    pose: buildPoseClip(
      'roguelite:doltan-pose',
      texture,
      Array.from({ length: 6 }, (_, col) => ({ sx: col * 16, sy: 0, durationMs: 120 })),
    ),
  };
}

// Ghost: 160x48 sheet, 10 cols/row. pose = tileNo 1..6 — identical frame
// geometry to Doltan's pose, different texture.
export function createGhostPoseClip(texture: TextureHandle): Record<string, SpriteAnimation> {
  return {
    pose: buildPoseClip(
      'roguelite:ghost-pose',
      texture,
      Array.from({ length: 6 }, (_, col) => ({ sx: col * 16, sy: 0, durationMs: 120 })),
    ),
  };
}

// Grass: 160x48 sheet, 10 cols/row. pose = tileNo 1..14 (ascending) then
// 14..1 (descending), 100ms each — 28 frames total, tileNo 14 doubled at the
// seam (deliberate hold at the peak, ported verbatim, not deduplicated).
// tileNo 1..10 -> row 0 col 0..9; tileNo 11..14 -> row 1 col 0..3.
function grassFrame(tileNo: number): { sx: number; sy: number; durationMs: number } {
  const col = (tileNo - 1) % 10;
  const row = Math.floor((tileNo - 1) / 10);
  return { sx: col * 16, sy: row * 16, durationMs: 100 };
}
export function createGrassPoseClip(texture: TextureHandle): Record<string, SpriteAnimation> {
  const ascending = Array.from({ length: 14 }, (_, i) => grassFrame(i + 1));
  const descending = Array.from({ length: 14 }, (_, i) => grassFrame(14 - i));
  return { pose: buildPoseClip('roguelite:grass-pose', texture, [...ascending, ...descending]) };
}
