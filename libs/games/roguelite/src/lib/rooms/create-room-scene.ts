import { type SceneDefinition, type TextureHandle, type World } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';
import { startAnimator } from '../anim/play-clip.js';
import type { RogueliteAssetKey } from '../assets.js';
import type { CombatData } from '../combat/combat-data.js';
import { spawnCombatPlayer } from '../combat/spawn-combat-player.js';
import { actorCenter } from '../events/event-commands.js';
import { CameraDirector, InputLock, RoomEvents } from '../events/event-components.js';
import { FxLibrary } from '../fx/fx-components.js';
import { AttackCooldown, Flags, PlayerControlled, PlayerForm, Position, RoomClock, RoomExits, RoomLighting, RoomTileLayout, SpriteRender, Animator, WallCollider } from '../components.js';
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
  readonly animAssets: Readonly<Record<string, LoadedAnimAsset>>;
  /** Combat spec numbers — needed by rooms whose player is a combat form (RoomDefinition.player). */
  readonly combat?: CombatData;
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
      world.set(world.createEntity(), RoomClock, { elapsedMs: 0 });
      if (definition.lighting) {
        world.set(world.createEntity(), RoomLighting, definition.lighting);
      }
      world.set(world.createEntity(), RoomExits, { exits: definition.exits });
      world.set(world.createEntity(), Flags, { values: {} });

      if (definition.player === 'ember' || definition.player === 'child') {
        const player = spawnCombatPlayer(world, definition.player, entryPoint.position, deps, definition.id);
        // Event plumbing (event spec): input lock, a camera events can steer, trigger bookkeeping.
        const center = actorCenter(world, player) ?? entryPoint.position;
        world.set(world.createEntity(), InputLock, { locked: false });
        world.set(world.createEntity(), CameraDirector, { mode: 'follow', target: 'player', x: center.x, y: center.y });
        world.set(world.createEntity(), RoomEvents, { roomId: definition.id, started: false, idleMs: 0, failCounts: {} });
        world.set(world.createEntity(), FxLibrary, { assets: deps.animAssets });
        definition.populate(world, { ...deps, entryPosition: entryPoint.position });
        deps.session.pendingEntryId = undefined;
        return;
      }

      const player = world.createEntity();
      const { sprite, clips, wallCollider } = spritePropsForForm(deps.session.currentForm, deps.formTextures);
      world.set(player, Position, entryPoint.position);
      world.set(player, PlayerControlled, { speed: PLAYER_SPEED });
      world.set(player, AttackCooldown, { remainingMs: 0, intervalMs: ATTACK_INTERVAL_MS });
      world.set(player, WallCollider, wallCollider);
      world.set(player, SpriteRender, { ...sprite, layer: GAMEPLAY_LAYER });
      world.set(player, Animator, startAnimator(clips, 'idle'));
      world.set(player, PlayerForm, { form: deps.session.currentForm });

      definition.populate(world, { ...deps, entryPosition: entryPoint.position });
      deps.session.pendingEntryId = undefined;
    },
  };
}
