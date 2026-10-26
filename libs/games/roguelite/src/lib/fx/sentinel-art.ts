import type { System } from '@g-game-farm/ribs';
import { playClip } from '../anim/play-clip.js';
import { SentinelAwakened, SentinelMelee } from '../combat/combat-components.js';
import type { CombatData } from '../combat/combat-data.js';
import { Animator, Position, SpriteRender } from '../components.js';
import { actorCenter, findActor } from '../events/event-commands.js';
import { spawnFx } from './fx.js';

/**
 * Sentinel art follows the AI (asset clips per state). The art is drawn
 * facing right; sentinels flip to face the player. A sentinel that stops
 * (Zone 6/7) or is beaten (test room) plays shutdown — it holds its last
 * frame — and the seal shards burst at its feet.
 */

function meleeClip(sentinel: SentinelMelee, data: CombatData): string {
  switch (sentinel.state) {
    case 'approach':
      return 'approach';
    case 'windup':
      return (sentinel.windupF ?? data.enemies['sentinel-melee'].windupF) > data.enemies['sentinel-melee'].windupF ? 'windup-easy' : 'windup';
    case 'active':
      return 'attack';
    case 'recovery':
      return 'recover';
    case 'stunned':
      return 'stun';
    case 'dormant':
    case 'defeated':
      return 'shutdown';
    default:
      return 'idle';
  }
}

function awakenedClip(sentinel: SentinelAwakened): string {
  return sentinel.state === 'asleep' ? 'dormant' : sentinel.state === 'waking' ? 'awaken' : 'chase';
}

export function createSentinelArtSystem(data: CombatData): System {
  const half = data.enemies['sentinel-melee'].body.height / 2;
  return {
    name: 'roguelite:fx/sentinel-art',
    order: 0.9, // after the AI decided this step's state, before the animator steps
    run: (ctx) => {
      const player = findActor(ctx.world, 'player');
      const target = player !== undefined ? actorCenter(ctx.world, player) : undefined;

      for (const [id, sentinel, animator, sprite, position] of ctx.world.query([SentinelMelee, Animator, SpriteRender, Position] as const)) {
        const clip = meleeClip(sentinel, data);
        if (animator.current !== clip && clip in animator.clips) {
          playClip(ctx.world, id, clip);
          if (clip === 'shutdown') spawnFx(ctx.world, 'fx-seal-shards', { x: position.x, y: position.y + half }, [{ clip: 'shatter' }]);
        }
        // Face the attack direction while attacking, otherwise the player.
        const attacking = sentinel.state === 'windup' || sentinel.state === 'active' || sentinel.state === 'recovery';
        const faceLeft = attacking && sentinel.dirX !== 0 ? sentinel.dirX < 0 : target ? target.x < position.x : sprite.flipX ?? false;
        const current = ctx.world.get(id, SpriteRender) ?? sprite;
        if (sentinel.state !== 'dormant' && sentinel.state !== 'defeated' && (current.flipX ?? false) !== faceLeft) ctx.world.set(id, SpriteRender, { ...current, flipX: faceLeft });
      }

      for (const [id, sentinel, animator, sprite, position] of ctx.world.query([SentinelAwakened, Animator, SpriteRender, Position] as const)) {
        const clip = awakenedClip(sentinel);
        if (animator.current !== clip && clip in animator.clips) playClip(ctx.world, id, clip);
        const faceLeft = sentinel.state === 'return' ? sentinel.home.x < position.x : target ? target.x < position.x : false;
        if (sentinel.state !== 'asleep' && (sprite.flipX ?? false) !== faceLeft) ctx.world.set(id, SpriteRender, { ...(ctx.world.get(id, SpriteRender) ?? sprite), flipX: faceLeft });
      }
    },
  };
}
