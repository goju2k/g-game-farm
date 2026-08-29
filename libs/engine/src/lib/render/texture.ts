import type { ImageSource, TextureHandle, TextureOptions } from './types.js';

interface StoredTexture {
  readonly glTexture: WebGLTexture;
  readonly width: number;
  readonly height: number;
}

function getSourceSize(source: ImageSource): { width: number; height: number } {
  // HTMLImageElement.width/height can be overridden by markup and disagree
  // with the actual decoded bitmap size — naturalWidth/naturalHeight is the
  // real one. Everything else in ImageSource (canvas, bitmap, ImageData)
  // exposes its true pixel size directly as width/height.
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Owns GPU texture objects. Only ever constructed by Renderer, one per Renderer instance. */
export class TextureStore {
  private readonly gl: WebGL2RenderingContext;
  private readonly textures = new Map<TextureHandle, StoredTexture>();
  private nextId = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  create(source: ImageSource, options: TextureOptions): TextureHandle {
    const { gl } = this;
    const glTexture = gl.createTexture();
    if (!glTexture) {
      throw new Error('Failed to create texture.');
    }

    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const filter = options.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    // Sprites are always drawn from an explicit sub-rect, never tiled, so
    // wrapping is fixed rather than exposed as an option.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const handle = this.nextId++ as TextureHandle;
    this.textures.set(handle, { glTexture, ...getSourceSize(source) });
    return handle;
  }

  destroy(handle: TextureHandle): void {
    const stored = this.textures.get(handle);
    if (!stored) {
      return;
    }
    this.gl.deleteTexture(stored.glTexture);
    this.textures.delete(handle);
  }

  getSize(handle: TextureHandle): Readonly<{ width: number; height: number }> {
    return { width: this.require(handle).width, height: this.require(handle).height };
  }

  bind(handle: TextureHandle, unit: number): void {
    const stored = this.require(handle);
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, stored.glTexture);
  }

  private require(handle: TextureHandle): StoredTexture {
    const stored = this.textures.get(handle);
    if (!stored) {
      throw new Error(`Unknown texture handle ${handle}.`);
    }
    return stored;
  }
}
