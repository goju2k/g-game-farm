'use client';
import { createSnapshotStore, createVirtualControls, createWhitePixelTexture, GameCanvas, loadTextures } from '@g-game-farm/ribs';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { loadAnimAsset } from './anim/anim-asset.js';
import { ROGUELITE_ANIM_ASSETS, ROGUELITE_ASSET_MANIFEST, ROGUELITE_TILESET_IMAGES } from './assets.js';
import { createCombatDebugSystem, EMPTY_COMBAT_DEBUG } from './combat/combat-debug.js';
import { loadCombatData } from './combat/combat-data.js';
import { createTouchAimPreviewSystem, createTouchAimSource, createTouchFeedSystem, EMPTY_TOUCH_VIEW } from './combat/touch-feed.js';
import { TouchControls, type TouchMode } from './ui/touch-controls.js';
import { createDialogueController } from './events/dialogue-controller.js';
import { createGameEventRegistry } from './events/event-commands.js';
import { loadEventScripts } from './events/event-director.js';
import { DialoguePanel, type SpeakerStyle } from './ui/dialogue-panel.js';
import { screenLayout, type ScreenLayout } from './ui/screen-layout.js';

/** Event script files (data/events/), loaded at startup — edit and reload, no rebuild (event spec §6). */
const EVENT_SCRIPT_FILES = ['data/events/opening.json'];
import { CombatDebugHud } from './ui/combat-debug-hud.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE, ROGUELITE_LAYERS } from './bootstrap.js';
import { createFlameSpiritPlaceholderTexture } from './player/flame-spirit-placeholder-texture.js';
import { EMPTY_DIALOGUE_STATE } from './scenario/dialogue-state.js';
import { createRogueliteSession } from './session.js';
import { createMonsterCountSystem } from './systems/monster-count-hud.js';
import { createRunScenarioSystem } from './systems/run-scenario.js';
import { DialogueBox } from './ui/dialogue-box.js';
import { MonsterCountHud } from './ui/monster-count-hud.js';

/** Around the game box: the margins, and the control area below it in portrait (touch spec §7, D-028). */
const MARGIN_BACKGROUND = '#0b0910';

/** Tracks this component's box (and the device pixel ratio) and picks the landscape / portrait layout. */
function useScreenLayout(): [RefObject<HTMLDivElement | null>, ScreenLayout] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<ScreenLayout>({ kind: 'landscape', game: { left: 0, top: 0, width: 0, height: 0 } });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The device-pixel ratio as the browser actually rasterizes this box (what GameCanvas's backing store gets), else devicePixelRatio.
    let dpr = window.devicePixelRatio || 1;
    const update = () => {
      const next = screenLayout(element.clientWidth, element.clientHeight, dpr);
      setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    update();
    const observer = new ResizeObserver(([entry]) => {
      const device = entry?.devicePixelContentBoxSize?.[0];
      dpr = device && entry.contentRect.width > 0 ? device.inlineSize / entry.contentRect.width : window.devicePixelRatio || 1;
      update();
    });
    try {
      observer.observe(element, { box: 'device-pixel-content-box' });
    } catch {
      observer.observe(element);
    }
    return () => observer.disconnect(); // device-pixel-content-box also reports DPR changes (zoom)
  }, []);
  return [ref, layout];
}

/** Where this widget's own copy of the game's assets is served from — see this package's public/game/. */
const ASSET_BASE_URL = '/game/';

export interface RogueliteGameProps {
  readonly showDevHud?: boolean;
  /** Dev convenience: start in this room (one of ROGUELITE_ROOM_IDS) instead of the demo's first. Read once at mount. */
  readonly bootScene?: string;
  /** On-screen touch controls: 'auto' follows the last input device (default), 'on'/'off' force it (?touch=1/0). */
  readonly touch?: TouchMode;
}

/**
 * The whole roguelite game as a single drop-in React component — the thing
 * a consumer (roguelite-playground, or any future deployment shell) actually
 * mounts. Engine creation, texture loading, and the render loop are
 * GameCanvas's (ribs) job, not this component's — this only wires
 * roguelite-specific content into it.
 *
 * `session` and `dialogueStore` are created once here (React-owned) and
 * threaded into the engine side — session as a plain mutable cross-room
 * object (see session.ts), dialogueStore as the one-way game->UI channel
 * DialogueBox reads. createRunScenarioSystem is registered here, not inside
 * registerRoguelite(), for the same reason createMonsterCountSystem already
 * is: bootstrap.ts has no business knowing about a React-owned store.
 */
export function RogueliteGame({ showDevHud = false, bootScene = ROGUELITE_BOOT_SCENE, touch = 'auto' }: RogueliteGameProps) {
  const monsterCountStore = useMemo(() => createSnapshotStore(0), []);
  const dialogueStore = useMemo(() => createSnapshotStore(EMPTY_DIALOGUE_STATE), []);
  const session = useMemo(() => createRogueliteSession(), []);
  const combatDebugStore = useMemo(() => createSnapshotStore(EMPTY_COMBAT_DEBUG), []);
  const virtualControls = useMemo(() => createVirtualControls(), []);
  const touchViewStore = useMemo(() => createSnapshotStore(EMPTY_TOUCH_VIEW), []);
  const touchAim = useMemo(() => createTouchAimSource(), []);
  const [spellRanges, setSpellRanges] = useState<{ quick: number; cast: number } | undefined>(undefined);
  const dialogue = useMemo(() => createDialogueController(), []);
  const [speakers, setSpeakers] = useState<Readonly<Record<string, SpeakerStyle>>>({});

  const [screenRef, layout] = useScreenLayout();
  const portrait = layout.kind === 'portrait';
  const { game } = layout;
  // Same element tree in both layouts, so rotating never remounts the engine — only styles change.
  // Before the first measurement, fill the screen (the canvas must never mount at 0×0).
  const gameStyle: CSSProperties =
    game.width > 0
      ? { position: 'absolute', left: game.left, top: portrait ? 'env(safe-area-inset-top, 0px)' : game.top, width: game.width, height: game.height }
      : { position: 'absolute', inset: 0 };
  const uiStyle: CSSProperties = portrait
    ? { position: 'absolute', left: 0, right: 0, bottom: 0, top: `calc(env(safe-area-inset-top, 0px) + ${game.height}px)`, pointerEvents: 'none' }
    : { position: 'absolute', inset: 0, pointerEvents: 'none' };

  return (
    <div ref={screenRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: MARGIN_BACKGROUND, touchAction: 'none' }}>
      <GameCanvas
        layers={ROGUELITE_LAYERS}
        pointerLayer="gameplay"
        showDevHud={showDevHud}
        virtualControls={virtualControls}
        style={gameStyle}
        setup={async (api, renderer) => {
          const textures = await loadTextures(renderer, ROGUELITE_ASSET_MANIFEST, ASSET_BASE_URL);
          const tilesetTextures = await loadTextures(renderer, ROGUELITE_TILESET_IMAGES, ASSET_BASE_URL);
          const animAssets = Object.fromEntries(
            await Promise.all(Object.entries(ROGUELITE_ANIM_ASSETS).map(async ([id, folder]) => [id, await loadAnimAsset(renderer, `${ASSET_BASE_URL}${folder}/${id}.anim.json`)] as const)),
          );
          const whitePixelTexture = createWhitePixelTexture(renderer);
          const formTextures = { mage: textures.player, flame: createFlameSpiritPlaceholderTexture(renderer) };

          const combat = await loadCombatData(ASSET_BASE_URL);
          const registry = createGameEventRegistry();
          const files = await Promise.all(EVENT_SCRIPT_FILES.map((file) => loadEventScripts(ASSET_BASE_URL + file, registry)));
          const scripts = { rooms: Object.assign({}, ...files.map((f) => f.rooms)) };
          setSpeakers(Object.assign({}, ...files.map((f) => (f as { speakers?: Record<string, SpeakerStyle> }).speakers ?? {})));
          registerRoguelite(api, textures, whitePixelTexture, formTextures, session, Math.random, tilesetTextures, animAssets, combat, { scripts, registry, dialogue });
          api.registerSystems({
            simulation: [createRunScenarioSystem({ textures, random: Math.random, formTextures, session, dialogueStore })],
            render: [
              createMonsterCountSystem(monsterCountStore),
              createCombatDebugSystem(combatDebugStore, { maxHp: combat.childHealth.maxHp, maxEmbers: combat.embers.max }),
              createTouchFeedSystem(combat, touchViewStore, touchAim),
              createTouchAimPreviewSystem(combat, touchAim, whitePixelTexture),
            ],
          });
          setSpellRanges({ quick: combat.spells.quick.range, cast: combat.spells.cast.maxAimRange });
          return bootScene;
        }}
      >
        <MonsterCountHud store={monsterCountStore} />
        <DialogueBox store={dialogueStore} />
        <CombatDebugHud store={combatDebugStore} />
      </GameCanvas>
      {/* Landscape: over the whole screen. Portrait: the control area under the game box. */}
      <div style={uiStyle}>
        {spellRanges && (
          <TouchControls virtual={virtualControls} view={touchViewStore} aim={touchAim} quickRange={spellRanges.quick} castRange={spellRanges.cast} mode={touch} />
        )}
        {/* After the touch layer, so a tap on the box (walking chatter) reaches it. */}
        <DialoguePanel controller={dialogue} speakers={speakers} fontBaseUrl={`${ASSET_BASE_URL}fonts/`} placement={portrait ? 'top' : 'bottom'} />
      </div>
    </div>
  );
}
