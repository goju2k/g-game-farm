import { loadTextures, type EngineRenderer, type SpriteAnimation, type SpriteAnimationFrame, type TextureHandle } from '@g-game-farm/ribs';

/**
 * The `.anim.json` format ribs-assets exports (asset contract 1 — see
 * ribs-assets' docs/asset-contract.md and schema/anim.schema.json). This is
 * a game-side adapter, same as rooms' Tiled converter: the engine only knows
 * SpriteAnimation, and each clip here maps onto one 1:1 — `frames` already
 * uses SpriteAnimationFrame's field names.
 */
export const ANIM_CONTRACT = 1;

export interface AnimAsset {
  readonly contract: typeof ANIM_CONTRACT;
  readonly id: string;
  /** Relative to the .anim.json's own folder. */
  readonly texture: string;
  /** Every frame of every clip has exactly this size — the contract guarantees it, parseAnimAsset re-checks it. */
  readonly frameSize: readonly [number, number];
  /**
   * The character's foot point (shadow point for floating ones) inside a
   * frame, in frame pixels, for the art's own facing (always right). When
   * drawn flipped, the mirrored point is `frameSize[0] - anchor[0]` — goes
   * straight into SpriteRender.originX/originY, which does that mirroring.
   */
  readonly anchor: readonly [number, number];
  readonly source?: string;
  readonly clips: Readonly<Record<string, { readonly loop: boolean; readonly frames: readonly SpriteAnimationFrame[] }>>;
}

const NAME = /^[a-z0-9-]+$/;
const TAG = /^[a-z0-9-]+:[a-z0-9-]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegInt(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0;
}

function isPair(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && v.every(isNonNegInt);
}

/**
 * Validates untrusted JSON against contract 1 and returns it typed. Throws
 * one Error listing every problem found, prefixed with `label` (usually the
 * URL) — a bad asset should fail loudly at load time, not as a garbled
 * sprite later. Doesn't check frame rects against the PNG's size: that
 * needs the decoded image, and ribs-assets' check-anim.mjs already gates it
 * before delivery.
 */
export function parseAnimAsset(json: unknown, label: string): AnimAsset {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(message);

  if (!isRecord(json)) {
    throw new Error(`${label}: not a JSON object`);
  }
  if (json['contract'] !== ANIM_CONTRACT) fail(`contract must be ${ANIM_CONTRACT} (got ${String(json['contract'])})`);
  if (typeof json['id'] !== 'string' || !NAME.test(json['id'])) fail('id: lowercase letters, digits, hyphens');
  if (typeof json['texture'] !== 'string' || !json['texture'].endsWith('.png')) fail('texture: a .png path');
  const frameSize = json['frameSize'];
  if (!isPair(frameSize) || frameSize[0] < 1 || frameSize[1] < 1) fail('frameSize: [w, h] positive integers');
  const anchor = json['anchor'];
  if (!isPair(anchor)) fail('anchor: [x, y] non-negative integers');
  else if (isPair(frameSize) && (anchor[0] > frameSize[0] || anchor[1] > frameSize[1])) fail(`anchor ${anchor.join(',')} is outside the ${frameSize.join('x')} frame`);

  const clips = json['clips'];
  if (!isRecord(clips) || Object.keys(clips).length === 0) {
    fail('clips: at least one');
  } else {
    for (const [name, clip] of Object.entries(clips)) {
      const at = `clips.${name}`;
      if (!NAME.test(name)) fail(`${at}: name must be lowercase letters, digits, hyphens`);
      if (!isRecord(clip)) {
        fail(`${at}: not an object`);
        continue;
      }
      if (typeof clip['loop'] !== 'boolean') fail(`${at}.loop: boolean`);
      const frames = clip['frames'];
      if (!Array.isArray(frames) || frames.length === 0) {
        fail(`${at}.frames: at least one`);
        continue;
      }
      frames.forEach((frame: unknown, i) => {
        const fa = `${at}.frames[${i}]`;
        if (!isRecord(frame)) {
          fail(`${fa}: not an object`);
          return;
        }
        if (!isNonNegInt(frame['sx']) || !isNonNegInt(frame['sy'])) fail(`${fa}: sx/sy non-negative integers`);
        if (!isNonNegInt(frame['durationMs']) || frame['durationMs'] === 0) fail(`${fa}: durationMs positive integer`);
        if (isPair(frameSize) && (frame['sWidth'] !== frameSize[0] || frame['sHeight'] !== frameSize[1])) {
          fail(`${fa}: size ${String(frame['sWidth'])}x${String(frame['sHeight'])} != frameSize ${frameSize.join('x')}`);
        }
        const tags = frame['tags'];
        if (tags !== undefined && (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string' || !TAG.test(t)))) {
          fail(`${fa}.tags: each "<action>:<phase>"`);
        }
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(`${label}: invalid anim asset (contract ${ANIM_CONTRACT})\n  - ${errors.join('\n  - ')}`);
  }
  return json as unknown as AnimAsset;
}

/** One SpriteAnimation per clip, keyed by clip name; each named `<id>:<clip>` so AnimationFrameTag events say which asset they came from. */
export function clipsFromAnimAsset(asset: AnimAsset, texture: TextureHandle): Record<string, SpriteAnimation> {
  const clips: Record<string, SpriteAnimation> = {};
  for (const [name, clip] of Object.entries(asset.clips)) {
    clips[name] = { name: `${asset.id}:${name}`, texture, loop: clip.loop, frames: clip.frames };
  }
  return clips;
}

export interface LoadedAnimAsset {
  readonly asset: AnimAsset;
  readonly texture: TextureHandle;
  readonly clips: Record<string, SpriteAnimation>;
}

/** Fetches + validates an .anim.json, then loads its sheet from the same folder. */
export async function loadAnimAsset(renderer: EngineRenderer, url: string): Promise<LoadedAnimAsset> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const asset = parseAnimAsset(await response.json(), url);
  const folder = url.slice(0, url.lastIndexOf('/') + 1);
  const { sheet } = await loadTextures(renderer, { sheet: asset.texture }, folder);
  return { asset, texture: sheet, clips: clipsFromAnimAsset(asset, sheet) };
}
