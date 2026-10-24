import {
  AnimationFrameTag,
  defineComponent,
  spriteAnimationSource,
  type PluginApi,
  type RenderSystem,
  type SceneDefinition,
  type SnapshotStore,
  type SpriteAnimation,
  type System,
  type TextureHandle,
} from '@g-game-farm/ribs';
import type { AnimAsset } from '../anim/anim-asset.js';
import { playClip, startAnimator } from '../anim/play-clip.js';
import { Animator, Position, SpriteRender } from '../components.js';
import { renderSpritesSystem } from '../systems/render-sprites.js';
import { stepAnimatorSystem } from '../systems/step-animator.js';

/**
 * Animation lab: a dev scene that plays every clip of one anim asset side by
 * side — top row as authored (facing right), bottom row flipped — with a
 * crosshair on each anchor and every AnimationFrameTag event logged. It
 * exercises the same pieces the real game uses (anim-asset loading,
 * Animator/startPending, stepAnimatorSystem, SpriteRender origin + flip),
 * so what looks right here looks right in a room.
 */

export const ANIM_LAB_SCENE = 'anim-lab';
export const ANIM_LAB_LAYER = 'gameplay';

/** Gap between cells and around the grid, in world units (= art pixels). */
const GAP = 16;
/** Pause after a non-looping clip finishes before it restarts. */
export const ANIM_LAB_RESTART_PAUSE_MS = 600;
const LOG_LIMIT = 14;

/** Restarts a finished non-looping clip after a pause, so one-shot clips (dash, parry) keep replaying. */
interface LabReplay {
  readonly pauseLeftMs: number;
}
const LabReplay = defineComponent<LabReplay>('roguelite:anim-lab/LabReplay');

export interface AnimLabTagLogEntry {
  /** Monotonic id — a stable React key. */
  readonly seq: number;
  readonly tick: number;
  readonly clip: string;
  readonly frameIndex: number;
  readonly tags: readonly string[];
  readonly flipped: boolean;
}

export interface AnimLabState {
  readonly log: readonly AnimLabTagLogEntry[];
  /** How many times each tag has fired, summed over both rows. */
  readonly tagCounts: Readonly<Record<string, number>>;
}

export const EMPTY_ANIM_LAB_STATE: AnimLabState = { log: [], tagCounts: {} };

export interface AnimLabLayout {
  readonly clipNames: readonly string[];
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** Anchor point (Position) of the cell at column `col`, row `row` (0 = as authored, 1 = flipped). */
  anchorAt(col: number, row: number): { readonly x: number; readonly y: number };
}

export function animLabLayout(asset: AnimAsset): AnimLabLayout {
  const clipNames = Object.keys(asset.clips);
  const [cellWidth, cellHeight] = asset.frameSize;
  const [anchorX, anchorY] = asset.anchor;
  return {
    clipNames,
    cellWidth,
    cellHeight,
    worldWidth: GAP + clipNames.length * (cellWidth + GAP),
    worldHeight: GAP + 2 * (cellHeight + GAP),
    anchorAt: (col, row) => ({
      x: GAP + col * (cellWidth + GAP) + (row === 1 ? cellWidth - anchorX : anchorX),
      y: GAP + row * (cellHeight + GAP) + anchorY,
    }),
  };
}

export interface AnimLabDeps {
  readonly asset: AnimAsset;
  readonly clips: Readonly<Record<string, SpriteAnimation>>;
  readonly whitePixel: TextureHandle;
  readonly store: SnapshotStore<AnimLabState>;
}

function marker(whitePixel: TextureHandle, width: number, height: number, tint: readonly [number, number, number, number]): SpriteRender {
  return { texture: whitePixel, layer: ANIM_LAB_LAYER, sx: 0, sy: 0, sWidth: 1, sHeight: 1, width, height, tint };
}

function createAnimLabSceneDefinition({ asset, clips, whitePixel }: AnimLabDeps): SceneDefinition {
  const layout = animLabLayout(asset);
  const [frameWidth, frameHeight] = asset.frameSize;
  return {
    name: ANIM_LAB_SCENE,
    setup: (world) => {
      layout.clipNames.forEach((clipName, col) => {
        for (const row of [0, 1]) {
          const at = layout.anchorAt(col, row);

          // Crosshair through the anchor: a faint vertical line over the frame's height and a short floor line.
          const vertical = world.createEntity();
          world.set(vertical, Position, { x: at.x, y: at.y - frameHeight });
          world.set(vertical, SpriteRender, marker(whitePixel, 1, frameHeight, [1, 0.3, 0.3, 0.35]));
          const floor = world.createEntity();
          world.set(floor, Position, { x: at.x - frameWidth / 2, y: at.y });
          world.set(floor, SpriteRender, marker(whitePixel, frameWidth, 1, [1, 1, 1, 0.25]));

          const actor = world.createEntity();
          world.set(actor, Position, at);
          world.set(actor, SpriteRender, {
            ...spriteAnimationSource(clips[clipName], 0),
            layer: ANIM_LAB_LAYER,
            width: frameWidth,
            height: frameHeight,
            flipX: row === 1,
            originX: asset.anchor[0],
            originY: asset.anchor[1],
          });
          world.set(actor, Animator, startAnimator(clips, clipName));
          world.set(actor, LabReplay, { pauseLeftMs: ANIM_LAB_RESTART_PAUSE_MS });
        }
      });
    },
  };
}

const labReplaySystem: System = {
  name: 'roguelite:anim-lab/replay',
  order: 2, // after stepAnimatorSystem (order 1) has marked the clip finished
  run: (ctx) => {
    for (const [id, animator, replay] of ctx.world.query([Animator, LabReplay] as const)) {
      if (!animator.state.finished) {
        continue;
      }
      const pauseLeftMs = replay.pauseLeftMs - ctx.deltaMs;
      if (pauseLeftMs > 0) {
        ctx.world.set(id, LabReplay, { pauseLeftMs });
        continue;
      }
      playClip(ctx.world, id, animator.current);
      ctx.world.set(id, LabReplay, { pauseLeftMs: ANIM_LAB_RESTART_PAUSE_MS });
    }
  },
};

/** postSimulation, so it sees every tag stepAnimatorSystem emitted this tick (render could miss ticks when several run per frame). */
function createLabTagLogSystem(store: SnapshotStore<AnimLabState>): System {
  let seq = 0;
  return {
    name: 'roguelite:anim-lab/tag-log',
    run: (ctx) => {
      const events = ctx.events.read(AnimationFrameTag);
      if (events.length === 0) {
        return;
      }
      const prev = store.getSnapshot();
      const tagCounts = { ...prev.tagCounts };
      const added: AnimLabTagLogEntry[] = [];
      for (const event of events) {
        for (const tag of event.tags) {
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
        const flipped = ctx.world.get(event.entity, SpriteRender)?.flipX ?? false;
        added.push({ seq: seq++, tick: ctx.tick, clip: event.clip, frameIndex: event.frameIndex, tags: event.tags, flipped });
      }
      store.set({ log: [...added.reverse(), ...prev.log].slice(0, LOG_LIMIT), tagCounts });
    },
  };
}

function createLabCameraSystem(layout: AnimLabLayout): RenderSystem {
  return {
    name: 'roguelite:anim-lab/camera',
    order: -1, // a layer's camera must be set before anything draws on it this frame
    run: (ctx) => {
      const { width, height } = ctx.renderer.getCanvasSize();
      // Largest integer zoom that fits the whole grid — integer so pixels stay crisp.
      const zoom = Math.max(1, Math.floor(Math.min(width / layout.worldWidth, height / layout.worldHeight)));
      ctx.renderer.setCamera(ANIM_LAB_LAYER, { x: layout.worldWidth / 2, y: layout.worldHeight / 2, zoom });
    },
  };
}

/** Registers the lab's components, systems and scene; boot it with ANIM_LAB_SCENE. */
export function registerAnimLab(api: PluginApi, deps: AnimLabDeps): void {
  api.registerComponents([Position, SpriteRender, Animator, LabReplay]);
  api.registerSystems({
    simulation: [stepAnimatorSystem, labReplaySystem],
    postSimulation: [createLabTagLogSystem(deps.store)],
    render: [createLabCameraSystem(animLabLayout(deps.asset)), renderSpritesSystem],
  });
  api.registerScenes([createAnimLabSceneDefinition(deps)]);
}
