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
 * `createTexture` time, not a layer's. Every layer, 2D or 3D, uses the same
 * single rendering pipeline (see sprite-batch-renderer.ts) — there is no
 * per-layer render-mode switch.
 */
export interface LayerConfig {
  readonly id: string;
  /** Camera-relative scroll speed. 1 = moves with the camera 1:1, 0 = fixed to screen. Defaults to 1. */
  readonly parallaxFactor?: number;
  /**
   * Snaps this layer's CAMERA (not individual sprites) to the pixel grid —
   * see pixel-snap.ts. Only produces its stated exact-pixel-alignment
   * guarantee for a top-down (default pitch), unrotated, orthographic
   * camera; silently a no-op otherwise (see
   * pixel-snap.ts's isDefaultTopDownOrthographic gate). Defaults to false.
   */
  readonly pixelSnap?: boolean;
}

/**
 * A camera's full 3D pose. `{x, y, zoom}` alone reproduces this engine's
 * original flat top-down behavior exactly (every other field defaults to
 * whatever value reproduces that case) — 2D is the Z=0, default-rotation
 * special case of a fundamentally 3D camera, not a separate mode. See
 * render/camera-3d.ts for the exact basis-vector derivation and
 * pixel-snap.ts for how `zoom`-based pixel alignment interacts with
 * rotation.
 */
export interface CameraPose {
  /** World-space position the camera is centered on. */
  readonly x: number;
  readonly y: number;
  /** Height above the ground plane. Default 1000 — provably inert for the default orthographic/top-down case (see camera-3d.ts's viewMatrix doc comment); only matters once pitch/perspective are in play. */
  readonly z?: number;
  /** Rotation around the world-vertical (Z) axis. Default 0. */
  readonly yawRadians?: number;
  /** Tilt away from straight-down. Default Math.PI/2 (top-down) — deliberately not 0, so OMITTING this field means "top-down," matching this engine's dominant use case. Pass 0 for a conventional horizon-level 3D camera rest pose instead. */
  readonly pitchRadians?: number;
  /** Rotation around the camera's own forward axis. Default 0. */
  readonly rollRadians?: number;
  /** Default 'orthographic' — matches this engine's original (and still primary) mode. Perspective is an explicit, separate opt-in, never a side effect of any other field. */
  readonly projectionKind?: 'orthographic' | 'perspective';
  /** Orthographic only. Screen pixels per world unit. Default 1. */
  readonly zoom?: number;
  /** Perspective only, radians. Default Math.PI/3 (60deg). */
  readonly fovYRadians?: number;
  readonly near?: number;
  readonly far?: number;
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
  /** Height above the ground plane. Default 0 — every sprite drawn before this feature existed is implicitly z=0. */
  readonly z?: number;
  /**
   * 'ground' (default): lies flat on the world XY plane at height `z`,
   * `width`/`height` extending along world X/Y exactly as before —
   * matches every sprite this engine has ever drawn. 'billboard': always
   * faces the camera, `(x,y,z)` is the top-left anchor in the camera's own
   * right/up plane, `width`/`height` extend along the camera's right/down
   * (screen-facing) axes instead of world X/Y. See render/quad3d.ts.
   */
  readonly orientation?: 'ground' | 'billboard';
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
  /**
   * Cameras are per-layer, not global — addressed by layer id, mirroring
   * SpriteDraw.layer's existing idiom. Reset to unset at the start of every
   * frame (see EngineRenderer.beginFrame's doc comment): a camera never
   * silently carries over from the previous frame. Throws for an unknown
   * layer id, matching submitSprite's own fail-fast convention below.
   */
  setCamera(layerId: string, pose: CameraPose): void;
  /** Throws if `draw.layer` is unknown, or if that layer has no camera set yet this frame (see setCamera). */
  submitSprite(draw: SpriteDraw): void;
  /**
   * The canvas's current size in CSS pixels — live, not a value fixed at
   * construction time. GameCanvas (engine-react) keeps this in sync with
   * the canvas's parent DOM element via ResizeObserver, calling resize()
   * on every observed change. Deliberately render-side only: simulation
   * never sees the canvas size (a host-authoritative coop host would
   * otherwise judge a remote player's input against its OWN screen) —
   * anything screen-relative the simulation needs is resolved into world
   * units at input-capture time instead (see screenToGround).
   */
  getCanvasSize(): Readonly<{ width: number; height: number }>;
}

/** The full surface the Engine owns. Structurally extends FrameRenderer. */
export interface EngineRenderer extends FrameRenderer {
  createTexture(source: ImageSource, options: TextureOptions): TextureHandle;
  destroyTexture(handle: TextureHandle): void;
  getTextureSize(handle: TextureHandle): Readonly<{ width: number; height: number }>;
  resize(width: number, height: number): void;
  /**
   * Which ground-plane (z=0) world point is under screen pixel (screenX,
   * screenY) — CSS pixels, top-left origin — in the frame most recently
   * PRESENTED on `layerId` (the last flush()'s camera for that layer, with
   * its parallax/pixel-snap adjustment applied), i.e. exactly what the
   * player was looking at when they moved the mouse. Meant for input
   * capture (see InputCaptureOptions.resolveWorldPosition): resolving
   * pointer input into world units on the machine that saw the screen,
   * before it ever reaches the simulation. undefined before that layer has
   * been drawn with a camera at least once, or when the ray misses the
   * ground (see camera-3d.ts's screenToGround).
   */
  screenToGround(layerId: string, screenX: number, screenY: number): Readonly<{ x: number; y: number }> | undefined;
  /**
   * Called by Engine.tick() only — not reachable from a render system's
   * ctx.renderer. Also resets every layer's camera to unset — see
   * setCamera's doc comment.
   */
  beginFrame(): void;
  flush(): void;
  /**
   * Releases every GPU resource this renderer owns (textures, per-layer
   * buffers/VAOs, the shader program) synchronously, rather than leaving
   * them to whenever the GC happens to collect the canvas/context — see
   * Engine.dispose()'s doc comment for why this matters for a host
   * embedding the engine (mount/unmount cycles). Not usable afterward;
   * mirrors InputCapture.dispose()'s one-shot contract.
   */
  dispose(): void;
}
