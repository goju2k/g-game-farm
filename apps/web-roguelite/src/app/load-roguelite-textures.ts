import type { EngineRenderer, TextureHandle } from '@g-game-farm/engine';
import { ROGUELITE_ASSET_MANIFEST, type RogueliteAssetKey } from '@g-game-farm/roguelite';

/** Where this app serves its copy of the game's assets from — see public/game/. */
const ASSET_BASE_URL = '/game/';

/**
 * DOM Image decode + GPU upload glue. Deliberately app-local, not engine
 * code: engine defines platform seams as narrow interfaces implemented per
 * app (see IStorageAdapter), it doesn't ship concrete DOM implementations.
 * `nearest` filtering because every asset here is a pixel sprite drawn on
 * the `gameplay` layer, which is pixelSnap: true (see CLAUDE.md's render
 * layer stack section).
 */
async function loadTexture(renderer: EngineRenderer, relativePath: string): Promise<TextureHandle> {
  const img = new Image();
  img.src = ASSET_BASE_URL + relativePath;
  await img.decode();
  return renderer.createTexture(img, { filter: 'nearest' });
}

export async function loadRogueliteTextures(renderer: EngineRenderer): Promise<Record<RogueliteAssetKey, TextureHandle>> {
  const entries = Object.entries(ROGUELITE_ASSET_MANIFEST) as [RogueliteAssetKey, string][];
  const loaded = await Promise.all(
    entries.map(async ([key, relativePath]) => [key, await loadTexture(renderer, relativePath)] as const),
  );
  return Object.fromEntries(loaded) as Record<RogueliteAssetKey, TextureHandle>;
}
