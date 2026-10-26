import type { EntityId, World } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';
import { startAnimator } from '../anim/play-clip.js';
import { Animator, DropShadow, LightEmitter, PlayerControlled, Position, SpriteRender, WallCollider } from '../components.js';
import { COLD_LIGHT, EMBER_LIGHT_TINT, MAGE_HAND_FLAME } from '../lighting/dungeon-lighting.js';
import { CombatPlayer, SentinelAwakened, SentinelMelee } from './combat-components.js';
import type { CombatData, PlayerFormKey } from './combat-data.js';
import { spawnCombatSingletons } from './combat-systems.js';
import { createEmberClips } from './ember-clips.js';

const CHILD_ASSET = 'player-child';
/** ribs-assets' shadow spec for player-child: 8/6px rows, 6/4px while float lifts (frames 2-4). */
const CHILD_SHADOW = { widths: [8, 6], alpha: 0.4, lifted: { clip: 'float', frames: [2, 3, 4], widths: [6, 4] } } as const;
/**
 * The ember is a small blue flame (planning D-015/D-017): the brightest
 * thing on screen, lighting little around it — 28px cold light. All Part 0 light is cold; the first
 * warm light is the child form's hand flame after the Zone 9 form change.
 */
const EMBER_LIGHT = { offsetX: 0, offsetY: -8, radius: 28, tint: EMBER_LIGHT_TINT } as const;

/**
 * Spawns the combat-spec player at `at` (its foot point) plus the combat
 * singletons, with `at` as the soft-restart checkpoint. Needs the combat
 * data and the player-child anim asset (the ember look borrows its frames).
 */
export function spawnCombatPlayerEntity(
  world: World,
  form: PlayerFormKey,
  at: Readonly<{ x: number; y: number }>,
  deps: { readonly combat?: CombatData; readonly animAssets: Readonly<Record<string, LoadedAnimAsset>> },
  roomId: string,
): EntityId {
  const combat = deps.combat;
  const child = deps.animAssets[CHILD_ASSET];
  if (!combat || !child) {
    throw new Error(`room "${roomId}": a combat player needs the combat data and the "${CHILD_ASSET}" anim asset loaded.`);
  }
  const formData = combat.playerForms[form];
  const clips = form === 'ember' ? createEmberClips(child) : child.clips;
  const firstClip = form === 'ember' ? 'idle' : 'float';
  const animator = startAnimator(clips, firstClip);
  const frame = clips[firstClip].frames[0];
  const [frameWidth, frameHeight] = child.asset.frameSize;

  const player = world.createEntity();
  world.set(player, Position, { x: at.x, y: at.y });
  // PlayerControlled marks "the player" for the camera and exit triggers; its legacy movement skips CombatPlayer.
  world.set(player, PlayerControlled, { speed: formData.moveSpeed });
  world.set(player, CombatPlayer, {
    form,
    action: { kind: 'free' },
    dashCooldownF: 0,
    buffer: undefined,
    facingX: 1,
    facingY: 0,
    ...(form === 'child' ? { hp: combat.childHealth.maxHp } : {}),
    invulnerableF: 0,
    embers: 0,
    quickCooldownF: 0,
    quickWindupF: 0,
    castCooldownF: 0,
  });
  world.set(player, WallCollider, formData.wallCollider);
  world.set(player, SpriteRender, {
    texture: child.texture,
    layer: 'gameplay',
    sx: frame.sx,
    sy: frame.sy,
    sWidth: frameWidth,
    sHeight: frameHeight,
    width: frameWidth,
    height: frameHeight,
    originX: child.asset.anchor[0],
    originY: child.asset.anchor[1],
  });
  world.set(player, Animator, animator);
  if (form === 'child') {
    // Act 2: the first warm light — the hand flame (planning D-015).
    world.set(player, LightEmitter, { ...MAGE_HAND_FLAME, radius: combat.handFlame.radius });
    world.set(player, DropShadow, CHILD_SHADOW);
  } else {
    world.set(player, LightEmitter, EMBER_LIGHT);
    world.set(player, DropShadow, { widths: [6, 4], alpha: 0.4 });
  }
  return player;
}

/** The combat player plus the combat singletons, with `at` as the soft-restart checkpoint. */
export function spawnCombatPlayer(
  world: World,
  form: PlayerFormKey,
  at: Readonly<{ x: number; y: number }>,
  deps: { readonly combat?: CombatData; readonly animAssets: Readonly<Record<string, LoadedAnimAsset>> },
  roomId: string,
): EntityId {
  const player = spawnCombatPlayerEntity(world, form, at, deps, roomId);
  spawnCombatSingletons(world, at);
  return player;
}

/** A melee sentinel at `at` (body center), waiting `startDelayF` before its first approach. Overrides cover zone tuning (spec §9). */
export function spawnSentinelMelee(
  world: World,
  at: Readonly<{ x: number; y: number }>,
  options: {
    readonly parriesToStop?: number;
    readonly windupF?: number;
    readonly cueF?: number;
    readonly startDelayF?: number;
    readonly assist?: SentinelMelee['assist'];
    readonly hp?: number;
    readonly reviveF?: number;
  } = {},
): void {
  const sentinel = world.createEntity();
  world.set(sentinel, Position, { x: at.x, y: at.y });
  world.set(sentinel, SentinelMelee, {
    state: 'wait',
    framesLeft: options.startDelayF ?? 30,
    dirX: 1,
    dirY: 0,
    attackSpent: true,
    home: { x: at.x, y: at.y },
    parriesTaken: 0,
    ...(options.parriesToStop !== undefined ? { parriesToStop: options.parriesToStop } : {}),
    ...(options.windupF !== undefined ? { windupF: options.windupF } : {}),
    ...(options.cueF !== undefined ? { cueF: options.cueF } : {}),
    ...(options.assist ? { assist: options.assist } : {}),
    ...(options.hp !== undefined ? { hp: options.hp } : {}),
    ...(options.reviveF !== undefined ? { reviveF: options.reviveF } : {}),
  });
  world.set(sentinel, LightEmitter, { offsetX: 0, offsetY: 0, radius: 14, tint: COLD_LIGHT });
}

/** An awakened sentinel asleep at `at` (body center) — looks like remains until the player comes near (spec §8-1). */
export function spawnSentinelAwakened(world: World, at: Readonly<{ x: number; y: number }>): void {
  const sentinel = world.createEntity();
  world.set(sentinel, Position, { x: at.x, y: at.y });
  world.set(sentinel, SentinelAwakened, { state: 'asleep', framesLeft: 0, home: { x: at.x, y: at.y } });
}
