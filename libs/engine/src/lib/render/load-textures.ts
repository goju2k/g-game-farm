import type { EngineRenderer, TextureHandle } from './types.js';

/**
 * Fetches, decodes, and uploads a manifest of relative image paths as
 * textures — generic DOM Image-decode-and-upload glue, parameterized over
 * any string-keyed manifest. Deliberately NOT a multi-platform IAssetLoader
 * abstraction (out of scope for now) — this only ever runs in a browser
 * context, same as the rest of this render module (WebGL2, ImageSource).
 */
export async function loadTextures<K extends string>(
  renderer: EngineRenderer,
  manifest: Readonly<Record<K, string>>,
  baseUrl: string,
  options: { readonly filter?: 'nearest' | 'linear' } = {},
): Promise<Record<K, TextureHandle>> {
  const filter = options.filter ?? 'nearest';
  const entries = Object.entries(manifest) as [K, string][];
  const loaded = await Promise.all(
    entries.map(async ([key, relativePath]) => {
      const img = new Image();
      img.src = baseUrl + relativePath;
      await img.decode();
      return [key, renderer.createTexture(img, { filter })] as const;
    }),
  );
  return Object.fromEntries(loaded) as Record<K, TextureHandle>;
}
