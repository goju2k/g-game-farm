import type { System, TextureHandle } from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from '../assets.js';
import { WaveSpawner } from '../components.js';
import { spawnMonsterWave } from '../monsters/monster-wave.js';

/**
 * Ports the old pre-engine repo's OpeningScene#gameStep() exactly,
 * including a subtlety that's easy to flatten by accident: `timeUnit` is
 * computed from the spawner's waveCount BEFORE this trigger's increment
 * (the *old* wave count), while `multiple` is computed from waveCount
 * AFTER the same increment (the *new* wave count) — genuinely different
 * values within one triggering call, not the same waveCount read twice.
 * See old OpeningScene.ts's gameStep(): `timeUnit` reads
 * `this.timeIterateCount` before `this.timeIterateCount += 1` runs;
 * `multiple` reads it again on the next line, after that increment.
 *
 * On trigger, elapsedMs hard-resets to 0 — not decremented by timeUnit —
 * old code's `this.timeTotal = 0`, so overshoot past timeUnit is
 * discarded, not carried into the next wave's timer.
 *
 * A factory (not a plain const) because it needs `textures` to spawn new
 * monsters — same reason createFireProjectilesSystem is a factory.
 * `random` defaults to Math.random for production; tests pass a
 * deterministic stub instead of monkey-patching the global.
 *
 * No `order` set (defaults to 0, movePlayerSystem's own tier) —
 * deliberately NOT the order:1 tier chasePlayerSystem/stepAnimatorSystem/
 * createFireProjectilesSystem use: those need to run after
 * movePlayerSystem because they read the player's post-move Position or a
 * just-switched Animator.state. This system reads neither — spawn
 * positions are independently randomized, not derived from the player —
 * but it DOES need to run before chasePlayerSystem (order 1), so a monster
 * spawned this tick takes its first chase step this same tick rather than
 * sitting frozen for one tick. That matches the old game's own per-tick
 * order: OpeningScene's step() runs gameStep() (spawning) before its
 * monster-step loop (movement), within the same step(time) call.
 */
export function createWaveSpawnSystem(
  textures: Record<RogueliteAssetKey, TextureHandle>,
  random: () => number = Math.random,
): System {
  return {
    name: 'roguelite:wave-spawn',
    run: (ctx) => {
      for (const [id, spawner] of ctx.world.query([WaveSpawner] as const)) {
        const elapsedMs = spawner.elapsedMs + ctx.deltaMs;
        const timeUnit = Math.max(2000, 7000 - 500 * Math.floor(spawner.waveCount / 5 + 1));

        if (elapsedMs > timeUnit) {
          const waveCount = spawner.waveCount + 1;
          const multiple = Math.floor(waveCount / 2 + 1);
          const count = Math.min(10, Math.floor(random() * multiple));
          spawnMonsterWave(ctx.world, textures, count, random);
          ctx.world.set(id, WaveSpawner, { elapsedMs: 0, waveCount });
        } else {
          ctx.world.set(id, WaveSpawner, { elapsedMs, waveCount: spawner.waveCount });
        }
      }
    },
  };
}
