import { evaluateCondition, type RenderSystem, type TextureHandle } from '@g-game-farm/ribs';
import { comboLevel } from '../rules/combo.js';
import { Flags, Position, RoomExits, SpriteRender } from '../components.js';
import { CombatCheckpoint, CombatPlayer, ParrySpark, ScreenFade, SentinelAwakened, SentinelMelee, SpellBurst, SpellProjectile } from './combat-components.js';
import type { CombatData } from './combat-data.js';
import { sentinelAttackBox, sentinelBody } from './combat-geometry.js';

const LAYER = 'gameplay';
type Rgba = readonly [number, number, number, number];

/** Palette glow colors — listed as emissive in the dungeon lighting, so they stay bright in the dark (spec §8-2: the seal light brightens). */
const SEAL_LIGHT: Rgba = [0x5f / 255, 0xcd / 255, 0xe4 / 255, 1];
const SEAL_FLASH: Rgba = [0xcb / 255, 0xdb / 255, 0xfc / 255, 1];
/** The parry cue: pure white, one pixel wider than the body all round — distinct from the blue ember's #bfeaff (planning D-017). */
const CUE: Rgba = [1, 1, 1, 1];
const BODY: Rgba = [0.42, 0.45, 0.52, 1];
const BODY_STUNNED: Rgba = [0.3, 0.33, 0.45, 1];
const BODY_DORMANT: Rgba = [0.22, 0.22, 0.26, 1];
/** Spell fire — the hand-flame palette's orange, emissive in the dungeon lighting. */
const SPELL_FIRE: Rgba = [0xdf / 255, 0x71 / 255, 0x26 / 255, 1];
const SPELL_CORE: Rgba = [0xfb / 255, 0xf2 / 255, 0x36 / 255, 1];

/**
 * Graybox drawing for combat: sentinels as blocks whose windup reads in
 * three steps (core of seal light grows -> holds -> whole body flashes for
 * the cue), their live attack box, and parry sparks.
 * Replaced by real sprites when the asset room delivers them.
 */
export function createRenderCombatSystem(data: CombatData, whitePixel: TextureHandle): RenderSystem {
  const stats = data.enemies['sentinel-melee'];
  return {
    name: 'roguelite:combat/render',
    order: -0.4, // after the camera and shadows, before character sprites
    run: (ctx) => {
      const rect = (x: number, y: number, width: number, height: number, tint: Rgba) =>
        ctx.renderer.submitSprite({ layer: LAYER, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x, y, width, height, tint });

      for (const [sentinelId, sentinel, position] of ctx.world.query([SentinelMelee, Position] as const)) {
        if (ctx.world.get(sentinelId, SpriteRender)) continue; // drawn by its art (render-sprites)
        const body = sentinelBody(position, stats);
        const windupF = sentinel.windupF ?? stats.windupF;
        const cueF = sentinel.cueF ?? stats.cueF;
        const cue = sentinel.state === 'windup' && sentinel.framesLeft <= cueF;
        if (sentinel.state === 'defeated') {
          rect(Math.round(body.x), Math.round(body.y) + body.height - 4, body.width, 4, BODY_DORMANT); // collapsed
          continue;
        }
        if (cue) {
          rect(Math.round(body.x) - 1, Math.round(body.y) - 1, body.width + 2, body.height + 2, CUE);
        } else {
          const bodyTint = sentinel.state === 'stunned' ? BODY_STUNNED : sentinel.state === 'dormant' ? BODY_DORMANT : BODY;
          rect(Math.round(body.x), Math.round(body.y), body.width, body.height, bodyTint);
        }

        if (sentinel.state === 'windup' && !cue) {
          // Seal-light core: 2px -> 8px over the windup's first part, then holds.
          const progress = Math.min(1, (windupF - sentinel.framesLeft) / Math.max(1, windupF - cueF - 8));
          const size = 2 + 2 * Math.round(3 * progress);
          rect(Math.round(position.x - size / 2), Math.round(position.y - size / 2), size, size, SEAL_LIGHT);
        } else if (sentinel.state !== 'dormant') {
          rect(Math.round(position.x - 1), Math.round(position.y - 1), 2, 2, sentinel.state === 'active' ? SEAL_FLASH : SEAL_LIGHT);
        }

        if (sentinel.hp !== undefined) {
          // Health pips above the body, one px each.
          const width = Math.round((body.width * sentinel.hp) / stats.hp);
          rect(Math.round(body.x), Math.round(body.y) - 3, body.width, 1, [0.1, 0.1, 0.12, 0.8]);
          rect(Math.round(body.x), Math.round(body.y) - 3, width, 1, SEAL_LIGHT);
        }

        if (sentinel.state === 'windup' || sentinel.state === 'active') {
          const box = sentinelAttackBox(position, sentinel.dirX, sentinel.dirY, stats);
          rect(Math.round(box.x), Math.round(box.y), box.width, box.height, sentinel.state === 'active' ? [SEAL_LIGHT[0], SEAL_LIGHT[1], SEAL_LIGHT[2], 0.6] : [1, 1, 1, 0.06]);
        }
      }

      // Exits of a combat room: dim while locked, seal light once open.
      if ([...ctx.world.query([CombatCheckpoint] as const)].length > 0) {
        const flags = [...ctx.world.query([Flags] as const)][0]?.[1].values ?? {};
        for (const [, { exits }] of ctx.world.query([RoomExits] as const)) {
          for (const exit of exits) {
            const open = !exit.lockedUnless || evaluateCondition(exit.lockedUnless, { get: (name: string) => flags[name] === true });
            rect(exit.zone.x, exit.zone.y, exit.zone.width, exit.zone.height, open ? [SEAL_LIGHT[0], SEAL_LIGHT[1], SEAL_LIGHT[2], 0.35] : [0.05, 0.05, 0.08, 0.7]);
          }
        }
      }

      const awake = data.enemies['sentinel-awakened'];
      for (const [awakenedId, sentinel, position] of ctx.world.query([SentinelAwakened, Position] as const)) {
        if (ctx.world.get(awakenedId, SpriteRender)) continue;
        const x = Math.round(position.x - awake.body.width / 2);
        const y = Math.round(position.y - awake.body.height / 2);
        const asleep = sentinel.state === 'asleep' || sentinel.state === 'return';
        rect(x, y, awake.body.width, awake.body.height, asleep ? BODY_DORMANT : BODY);
        const flicker = sentinel.state === 'waking' && Math.floor(sentinel.framesLeft / 3) % 2 === 0;
        if (sentinel.state === 'chase' || flicker) {
          rect(Math.round(position.x - 2), Math.round(position.y - 2), 4, 4, SEAL_LIGHT);
        }
      }

      for (const [projectileId, projectile, position] of ctx.world.query([SpellProjectile, Position] as const)) {
        if (ctx.world.get(projectileId, SpriteRender)) continue;
        // Round: a plus-shaped 4px ball (corners cut) with a hot core.
        const x = Math.round(position.x);
        const y = Math.round(position.y);
        const r = projectile.size / 2;
        rect(x - r + 1, y - r, projectile.size - 2, projectile.size, SPELL_FIRE);
        rect(x - r, y - r + 1, projectile.size, projectile.size - 2, SPELL_FIRE);
        rect(x - 1, y - 1, 2, 2, SPELL_CORE);
      }

      for (const [, burst] of ctx.world.query([SpellBurst] as const)) {
        // A stepped disc: full radius ring of fire, shrinking core as it fades.
        const t = burst.framesLeft / burst.totalF;
        const r = burst.radius;
        for (let dy = -r; dy <= r; dy += 2) {
          const span = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
          rect(Math.round(burst.x - span), Math.round(burst.y + dy), span * 2, 2, [SPELL_FIRE[0], SPELL_FIRE[1], SPELL_FIRE[2], 0.55 * t]);
        }
        const core = Math.max(2, Math.round(r * 0.5 * t));
        rect(Math.round(burst.x - core), Math.round(burst.y - core), core * 2, core * 2, SPELL_CORE);
      }

      for (const [, spark] of ctx.world.query([ParrySpark] as const)) {
        // An expanding pixel ring (round, not a box).
        const t = 1 - spark.framesLeft / spark.totalF;
        const max = spark.radius ?? 14;
        const r = Math.max(1, Math.round(max * (0.3 + 0.7 * t)));
        const fire = spark.tone === 'fire';
        const tint: Rgba = fire ? (t < 0.5 ? SPELL_CORE : SPELL_FIRE) : t < 0.5 ? SEAL_FLASH : SEAL_LIGHT;
        const dots = Math.max(8, Math.round(r * 4));
        const seen = new Set<string>();
        for (let i = 0; i < dots; i++) {
          const a = (i / dots) * Math.PI * 2;
          const px = Math.round(spark.x + Math.cos(a) * r);
          const py = Math.round(spark.y + Math.sin(a) * r);
          const key = px + ',' + py;
          if (seen.has(key)) continue;
          seen.add(key);
          rect(px, py, 1, 1, tint);
        }
      }
    },
  };
}

/** The fade must cover the characters too, so it also draws after them. */
export function createRenderFadeOverlaySystem(whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:combat/render-fade',
    order: 10,
    run: (ctx) => {
      for (const [, fade] of ctx.world.query([ScreenFade] as const)) {
        const t = fade.framesLeft / fade.totalF;
        const alpha = fade.phase === 'out' ? 1 - t : t;
        for (const [, , position] of ctx.world.query([CombatPlayer, Position] as const)) {
          ctx.renderer.submitSprite({ layer: LAYER, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x: position.x - 2000, y: position.y - 2000, width: 4000, height: 4000, tint: [0, 0, 0, alpha] });
        }
      }
    },
  };
}

/** Hand-side combo display colors: L = the fireball's orange, R = the pillar's yellow, empty = a faint outline. */
const SLOT_EMPTY: Rgba = [0.8, 0.86, 0.99, 0.35];
const BONUS_TINT: Rgba = [1, 0.95, 0.6, 1];

/**
 * The combo slots by the hand flame (27_skill-combo §4): one per press of
 * the form's combo, filled with L (fire dot) / R (pillar bar) as they come;
 * a finisher's bonus floats up briefly — focus a burst, switch an arrow the
 * way of the dash, rhythm a ring. No text. Graybox shapes until the asset
 * room's ui-combo art.
 */
export function createRenderComboSystem(data: CombatData, whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:combat/render-combo',
    order: 7, // over the characters (overlay layer)
    run: (ctx) => {
      const dot = (x: number, y: number, width: number, height: number, tint: Rgba) =>
        ctx.renderer.submitSprite({ layer: 'overlay', texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x, y, width, height, tint });
      for (const [, player, position] of ctx.world.query([CombatPlayer, Position] as const)) {
        const level = comboLevel(data.combo, player.form);
        if (level <= 0 || player.action.kind === 'respawning') continue;
        // Beside and above the hand flame (MAGE_HAND_FLAME: +8/-9 facing right).
        const facing = player.facingX < 0 ? -1 : 1;
        const handX = Math.round(position.x + facing * 8);
        const top = Math.round(position.y - 21);
        const width = level * 4 - 1;
        const left = handX - Math.floor(width / 2);
        const presses = player.combo?.presses ?? [];
        for (let i = 0; i < level; i++) {
          const x = left + i * 4;
          const press = presses[i];
          if (press === 'L') {
            dot(x, top, 3, 3, SPELL_FIRE);
            dot(x + 1, top + 1, 1, 1, SPELL_CORE);
          } else if (press === 'R') {
            dot(x + 1, top - 1, 1, 4, SPELL_CORE);
            dot(x, top + 2, 3, 1, SPELL_FIRE);
          } else {
            dot(x, top, 3, 1, SLOT_EMPTY);
            dot(x, top + 2, 3, 1, SLOT_EMPTY);
            dot(x, top + 1, 1, 1, SLOT_EMPTY);
            dot(x + 2, top + 1, 1, 1, SLOT_EMPTY);
          }
        }
        const flash = player.comboFlash;
        if (flash) {
          const life = flash.framesLeft / 30;
          const tint: Rgba = [BONUS_TINT[0], BONUS_TINT[1], BONUS_TINT[2], Math.min(1, life * 2)];
          const cx = handX;
          const cy = top - 5 - Math.round((1 - life) * 4);
          if (flash.bonus === 'focus') {
            dot(cx - 2, cy, 5, 1, tint);
            dot(cx, cy - 2, 1, 5, tint);
            dot(cx - 1, cy - 1, 3, 3, tint);
          } else if (flash.bonus === 'switch') {
            const dir = player.action.kind === 'dash' && player.action.dirX !== 0 ? Math.sign(player.action.dirX) : -facing;
            // An arrowhead pointing the way of the dash.
            for (let k = 0; k < 3; k++) {
              dot(cx + dir * k, cy - 2 + k, 1, 1, tint);
              dot(cx + dir * k, cy + 2 - k, 1, 1, tint);
            }
            dot(cx - dir * 2, cy, 3, 1, tint);
          } else {
            dot(cx - 1, cy - 2, 3, 1, tint);
            dot(cx - 1, cy + 2, 3, 1, tint);
            dot(cx - 2, cy - 1, 1, 3, tint);
            dot(cx + 2, cy - 1, 1, 3, tint);
          }
        }
      }
    },
  };
}
