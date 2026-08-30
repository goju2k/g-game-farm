import type { TextureHandle, World } from '@g-game-farm/ribs';
import { startAnimationPlayer } from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from './assets.js';
import { Animator, Chaser, Hitbox, Life, Position, SpriteRender } from './components.js';
import { MONSTER_FRAME_SIZE, MONSTER_STARTING_LIFE } from './monster-constants.js';
import { MONSTER_ROSTER } from './monster-roster.js';
import { WORLD_SIZE } from './world-constants.js';

const GAMEPLAY_LAYER = 'gameplay';

/**
 * Spawns a random-sized group of every MONSTER_ROSTER species, scattered
 * across the WORLD_SIZE spawn box — old pre-engine repo's
 * generateMonster(count). For EACH species independently:
 * `speciesCount = floor(random()*count) + 1` — always >=1, even when count
 * is 0 (floor(x*0)+1 = 1 for any x in [0,1)) — count=0 still spawns exactly
 * 1 of each of the 4 species, never 0 total.
 *
 * random() consumption order, in MONSTER_ROSTER array order: one call for
 * that species' speciesCount, then two calls (x, then y) per spawned
 * monster of that species, before moving to the next species. This differs
 * from the old code's own call order (which drew all 4 species' counts up
 * front, then randomized all positions in one later pass over the
 * concatenated array) — that batching was an artifact of how the old code
 * built one combined array, not a semantic requirement: each draw is still
 * an independent uniform sample either way, so the resulting distribution
 * is equivalent. This function's own order is the contract test code
 * should build sequential random stubs against.
 *
 * Component wiring per monster mirrors bootstrap.ts's old inline spawn loop
 * exactly (Position/Chaser/Life/Hitbox/SpriteRender/Animator) — extracted
 * here so both the boot-time "1 of each" spawn and periodic waves
 * (systems/wave-spawn.ts) share it instead of duplicating it. createPoseClip
 * is called once per species (not once per monster) — Animator.clips' own
 * doc comment establishes sharing one clip object across many entities of
 * the same kind is safe.
 */
export function spawnMonsterWave(
  world: World,
  textures: Record<RogueliteAssetKey, TextureHandle>,
  count: number,
  random: () => number,
): void {
  for (const entry of MONSTER_ROSTER) {
    const speciesCount = Math.floor(random() * count) + 1;
    const texture = textures[entry.assetKey];
    const clips = entry.createPoseClip(texture);

    for (let i = 0; i < speciesCount; i++) {
      const monster = world.createEntity();
      world.set(monster, Position, {
        x: -WORLD_SIZE / 2 + random() * WORLD_SIZE - MONSTER_FRAME_SIZE / 2,
        y: -WORLD_SIZE / 2 + random() * WORLD_SIZE - MONSTER_FRAME_SIZE / 2,
      });
      world.set(monster, Chaser, { speed: entry.speed });
      world.set(monster, Life, { current: MONSTER_STARTING_LIFE });
      world.set(monster, Hitbox, entry.hitbox);
      world.set(monster, SpriteRender, {
        texture,
        layer: GAMEPLAY_LAYER,
        sx: 0,
        sy: 0,
        sWidth: MONSTER_FRAME_SIZE,
        sHeight: MONSTER_FRAME_SIZE,
        width: MONSTER_FRAME_SIZE,
        height: MONSTER_FRAME_SIZE,
      });
      world.set(monster, Animator, { clips, current: 'pose', state: startAnimationPlayer(clips.pose).state });
    }
  }
}
