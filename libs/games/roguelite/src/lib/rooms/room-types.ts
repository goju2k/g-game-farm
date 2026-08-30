import type { TextureHandle, World } from '@g-game-farm/ribs';
import type { RogueliteAssetKey } from '../assets.js';
import type { RoomEntryPoint, RoomExit, RoomTileLayout } from '../components.js';
import type { PlayerFormId, RogueliteSession } from '../session.js';

export interface RoomPopulateContext {
  readonly textures: Record<RogueliteAssetKey, TextureHandle>;
  readonly formTextures: Readonly<Record<PlayerFormId, TextureHandle>>;
  readonly whitePixelTexture: TextureHandle;
  readonly random: () => number;
  readonly session: RogueliteSession;
  readonly entryPosition: { readonly x: number; readonly y: number };
}

export interface RoomDefinition {
  /** Also this room's SceneDefinition.name (== RoomExit.targetRoomId). */
  readonly id: string;
  readonly tiles: RoomTileLayout;
  readonly exits: readonly RoomExit[];
  readonly entryPoints: readonly RoomEntryPoint[];
  /**
   * Spawns everything besides the player and the tilemap/exits/flags
   * singletons, which rooms/create-room-scene.ts already handles generically
   * for every room — monsters, NPCs, pickups, this room's ScenarioRunner.
   */
  readonly populate: (world: World, ctx: RoomPopulateContext) => void;
}
