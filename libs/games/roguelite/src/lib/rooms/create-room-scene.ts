import { startAnimationPlayer, type SceneDefinition, type TextureHandle, type World } from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from '../assets.js';
import { AttackCooldown, Flags, PlayerControlled, PlayerForm, Position, RoomExits, RoomTileLayout, SpriteRender, Animator, WallCollider } from '../components.js';
import { PLAYER_SPEED } from '../player/player-constants.js';
import { spritePropsForForm } from '../player/player-forms.js';
import { ATTACK_INTERVAL_MS } from '../player/projectile-constants.js';
import type { PlayerFormId, RogueliteSession } from '../session.js';
import type { RoomDefinition } from './room-types.js';

const GAMEPLAY_LAYER = 'gameplay';

export interface RoomSceneDeps {
  readonly textures: Record<RogueliteAssetKey, TextureHandle>;
  readonly formTextures: Readonly<Record<PlayerFormId, TextureHandle>>;
  readonly whitePixelTexture: TextureHandle;
  readonly random: () => number;
  readonly session: RogueliteSession;
}

/**
 * Turns a RoomDefinition into a real SceneDefinition — the plumbing every
 * room shares (tilemap/exits/flags singletons, spawning the player at the
 * right entry point in its current growth-stage form) lives here once, so
 * a room's own `populate()` only ever has to deal with what's actually
 * specific to that room (its monsters/NPCs/pickups/script).
 */
export function createRoomScene(definition: RoomDefinition, deps: RoomSceneDeps): SceneDefinition {
  return {
    name: definition.id,
    setup: (world: World) => {
      const entryId = deps.session.pendingEntryId ?? definition.entryPoints[0]?.id;
      const entryPoint = definition.entryPoints.find((e) => e.id === entryId);
      if (!entryPoint) {
        throw new Error(`room "${definition.id}": no entry point "${entryId}"`);
      }

      world.set(world.createEntity(), RoomTileLayout, definition.tiles);
      world.set(world.createEntity(), RoomExits, { exits: definition.exits });
      world.set(world.createEntity(), Flags, { values: {} });

      const player = world.createEntity();
      const { sprite, clips, wallCollider } = spritePropsForForm(deps.session.currentForm, deps.formTextures);
      world.set(player, Position, entryPoint.position);
      world.set(player, PlayerControlled, { speed: PLAYER_SPEED });
      world.set(player, AttackCooldown, { remainingMs: 0, intervalMs: ATTACK_INTERVAL_MS });
      world.set(player, WallCollider, wallCollider);
      world.set(player, SpriteRender, { ...sprite, layer: GAMEPLAY_LAYER });
      world.set(player, Animator, { clips, current: 'idle', state: startAnimationPlayer(clips.idle).state });
      world.set(player, PlayerForm, { form: deps.session.currentForm });

      definition.populate(world, { ...deps, entryPosition: entryPoint.position });
      deps.session.pendingEntryId = undefined;
    },
  };
}
