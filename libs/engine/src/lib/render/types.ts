export type TextureHandle = number & { readonly __brand: 'TextureHandle' };

/**
 * What createTexture() accepts — a narrower set than lib.dom's
 * TexImageSource, which also includes HTMLVideoElement/VideoFrame. Video
 * textures aren't a Phase 1 (or currently planned) use case, and
 * VideoFrame in particular has no plain width/height (only
 * displayWidth/codedWidth), so excluding it keeps texture size lookup a
 * single code path instead of a per-source-type branch.
 */
export type ImageSource = HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | ImageData;

/**
 * A stack entry is drawn back-to-front in array order — there is no
 * separate z-index, since one more knob that can disagree with array order
 * is exactly the kind of thing that causes bugs. `filter` (nearest/linear)
 * deliberately isn't here: GL filtering is a texture object's state, set at
 * `createTexture` time, not a layer's.
 */
export interface LayerConfig {
  readonly id: string;
  /** Camera-relative scroll speed. 1 = moves with the camera 1:1, 0 = fixed to screen. Defaults to 1. */
  readonly parallaxFactor?: number;
  /** Snap this layer's sprites (position and zoom) to the integer pixel grid. Defaults to false. */
  readonly pixelSnap?: boolean;
}

export interface CameraPose {
  /** World-space position the camera is centered on. */
  readonly x: number;
  readonly y: number;
  /** Screen pixels per world unit. Expected to be an integer and left unanimated in Phase 1. */
  readonly zoom: number;
}

export interface TextureOptions {
  readonly filter: 'nearest' | 'linear';
}

export interface SpriteDraw {
  readonly layer: string;
  readonly texture: TextureHandle;
  /** Source rect, in texture pixels. */
  readonly sx: number;
  readonly sy: number;
  readonly sWidth: number;
  readonly sHeight: number;
  /** Destination rect, in world units, top-left origin. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  /** RGBA multiplier applied to the sampled texel. Defaults to (1, 1, 1, 1). */
  readonly tint?: readonly [number, number, number, number];
}

/**
 * What a render system may do — submit this frame's draw calls. Mirrors
 * ReadonlyWorld: mutators (texture loading, layer/canvas changes) live only
 * on EngineRenderer, so a render system can't reach them even by accident.
 */
export interface FrameRenderer {
  setCamera(pose: CameraPose): void;
  submitSprite(draw: SpriteDraw): void;
}

/** The full surface the Engine owns. Structurally extends FrameRenderer. */
export interface EngineRenderer extends FrameRenderer {
  createTexture(source: ImageSource, options: TextureOptions): TextureHandle;
  destroyTexture(handle: TextureHandle): void;
  getTextureSize(handle: TextureHandle): Readonly<{ width: number; height: number }>;
  resize(width: number, height: number): void;
  /** Called by Engine.tick() only — not reachable from a render system's ctx.renderer. */
  beginFrame(): void;
  flush(): void;
}
