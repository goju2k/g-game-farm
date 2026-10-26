'use client';
import { createAudioEngine, createSnapshotStore, useSnapshotStore, createVirtualControls, createWhitePixelTexture, GameCanvas, loadTextures, type AudioContextLike, type Engine, type IStorageAdapter } from '@g-game-farm/ribs';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createSoundQueue, createSoundSystem } from './audio/sound-cues.js';
import { createSoundDirectorSystem } from './audio/sound-director.js';
import { loadSoundManifest, preloadSounds } from './audio/sound-manifest.js';
import { createSaveStore, DEFAULT_PREFERENCES, resetSession, restoreCheckpoint, type Preferences, type SaveData, type SoundSettings } from './save/save-game.js';
import { GameShell, type ShellScreen, type TitleArt } from './ui/game-shell.js';
import { createRecordController, loadRecords } from './records/record-controller.js';
import { RecordPanel } from './ui/record-panel.js';
import { createHintController, loadHints, type HintDef } from './hints/hints.js';
import { HintPanel, type HintArt } from './ui/hint-panel.js';
import { loadUiClips } from './ui/anim-sprite.js';
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

/** Records (31 §0): id -> Korean text + readable — written by the planning room beside the event scripts. */
const RECORDS_FILE = 'data/events/records.json';
/** Event script files (data/events/), loaded at startup — edit and reload, no rebuild (event spec §6). */
const EVENT_SCRIPT_FILES = ['data/events/opening.json'];
import { CombatDebugHud } from './ui/combat-debug-hud.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE, ROGUELITE_LAYERS, ROGUELITE_ROOM_IDS } from './bootstrap.js';
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

/** The empty scene behind the title screen (nothing simulates until "start"). */
const TITLE_SCENE = 'title';
/** Shown on the title (demo plan §4, D-028). */
const DEMO_TITLE = '센티넬';
const DEMO_VERSION = 'demo 0.1';
/** Title background (ribs-assets #28) and its seal lamps' light, near to far (asset room's script values, art px). */
const TITLE_ART_FOLDER = 'ui/title-bg';
const TITLE_LAMPS: TitleArt['lamps'] = [
  { x: 65, y: 241, radius: 24 },
  { x: 414, y: 241, radius: 24 },
  { x: 89, y: 172, radius: 21 },
  { x: 372, y: 119, radius: 18 },
  { x: 120, y: 81, radius: 16 },
  { x: 350, y: 56, radius: 14 },
  { x: 135, y: 39, radius: 13 },
];

/** The title art's frames, from its anim asset; undefined (plain dark title) if it can't be read. */
async function loadTitleArt(baseUrl: string): Promise<TitleArt | undefined> {
  try {
    const response = await fetch(`${baseUrl}${TITLE_ART_FOLDER}/title-bg.anim.json`);
    if (!response.ok) return undefined;
    const anim = (await response.json()) as { frameSize: [number, number]; texture: string; clips: { idle?: { frames: TitleArt['frames'] } } };
    const frames = anim.clips.idle?.frames;
    if (!frames || frames.length === 0) return undefined;
    return { url: `${baseUrl}${TITLE_ART_FOLDER}/${anim.texture}`, width: anim.frameSize[0], height: anim.frameSize[1], frames, lamps: TITLE_LAMPS };
  } catch {
    return undefined;
  }
}

/** The interfaces a host implements for RoguelitePlatform (re-exported so hosts need only this package). */
export type { AudioContextLike, IStorageAdapter } from '@g-game-farm/ribs';

/** Platform pieces the host injects (platform abstraction, CLAUDE.md) — each optional; without one that feature is just off. */
export interface RoguelitePlatform {
  /** Continue + settings. Without it: no continue, settings last for the session. */
  readonly storage?: IStorageAdapter;
  /** Sound. Without it: silent. */
  readonly createAudioContext?: () => AudioContextLike | undefined;
}

export interface RogueliteGameProps {
  readonly showDevHud?: boolean;
  /** ?debug: debug HUDs, test rooms, placeholder beeps for sounds without files. */
  readonly debug?: boolean;
  /** Skip the title and start straight in bootScene (dev: ?room=). */
  readonly skipTitle?: boolean;
  readonly platform?: RoguelitePlatform;
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
export function RogueliteGame({ showDevHud = false, bootScene = ROGUELITE_BOOT_SCENE, touch = 'auto', debug = false, skipTitle = false, platform }: RogueliteGameProps) {
  const monsterCountStore = useMemo(() => createSnapshotStore(0), []);
  const dialogueStore = useMemo(() => createSnapshotStore(EMPTY_DIALOGUE_STATE), []);
  const session = useMemo(() => createRogueliteSession(), []);
  const combatDebugStore = useMemo(() => createSnapshotStore(EMPTY_COMBAT_DEBUG), []);
  const virtualControls = useMemo(() => createVirtualControls(), []);
  const touchViewStore = useMemo(() => createSnapshotStore(EMPTY_TOUCH_VIEW), []);
  const touchAim = useMemo(() => createTouchAimSource(), []);
  const [spellRanges, setSpellRanges] = useState<{ quick: number; cast: number } | undefined>(undefined);
  const dialogue = useMemo(() => createDialogueController(), []);
  const records = useMemo(() => createRecordController(), []);
  // First-use hints (D-035): defined in data/hints.json, loaded in setup.
  const hints = useMemo(() => createHintController(), []);
  const hintDefs = useRef<Readonly<Record<string, HintDef>>>({});
  const hint = useSnapshotStore(hints.view);
  const [touchActive, setTouchActive] = useState(false);
  const [hintArt, setHintArt] = useState<HintArt | undefined>(undefined);
  useEffect(() => {
    void Promise.all([loadUiClips(ASSET_BASE_URL, 'ui/hints', 'ui-key'), loadUiClips(ASSET_BASE_URL, 'ui/hints', 'guide-dash'), loadUiClips(ASSET_BASE_URL, 'ui/hints', 'guide-parry')]).then(([keys, dash, parry]) =>
      setHintArt({
        ...(keys ? { keys } : {}),
        guides: { ...(dash?.['loop'] ? { dash: dash['loop'] } : {}), ...(parry?.['loop'] ? { parry: parry['loop'] } : {}) },
        panel: `${ASSET_BASE_URL}ui/hints/guide-panel.png`,
      }),
    );
  }, []);
  const recordOpen = useSnapshotStore(records.view).open !== undefined;
  const [speakers, setSpeakers] = useState<Readonly<Record<string, SpeakerStyle>>>({});

  // ---- sound, save, screens (demo 0 M1) ----
  const audio = useMemo(() => createAudioEngine({ createContext: platform?.createAudioContext, missing: debug ? 'beep' : 'silent' }), []);
  useEffect(() => () => audio.dispose(), [audio]);
  const soundQueue = useMemo(() => createSoundQueue(), []);
  const saveStore = useMemo(() => createSaveStore(platform?.storage, ROGUELITE_ROOM_IDS), []);
  const engineRef = useRef<Engine | undefined>(undefined);
  const [screen, setScreen] = useState<ShellScreen>('loading');
  const [save, setSave] = useState<SaveData | undefined>(undefined);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [controlsCard, setControlsCard] = useState(false);
  const [titleArt, setTitleArt] = useState<TitleArt | undefined>(undefined);
  useEffect(() => void loadTitleArt(ASSET_BASE_URL).then(setTitleArt), []);

  useEffect(() => {
    void saveStore.loadSave().then(setSave);
    void saveStore.loadPreferences().then((loaded) => {
      setPrefs(loaded);
      audio.setVolume('bgm', loaded.sound.bgm);
      audio.setVolume('sfx', loaded.sound.sfx);
    });
    session.onCheckpoint = (checkpoint) => {
      void saveStore.writeCheckpoint(checkpoint);
      setSave({ version: 1, checkpoint, savedAt: Date.now() });
    };
    // Browsers only start audio from a gesture: the title's "start" is one, and any later tap or key works too.
    const unlock = () => void audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      session.onCheckpoint = undefined;
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);

  const begin = useCallback(
    (room: string) => {
      void audio.unlock();
      dialogue.hide();
      engineRef.current?.requestSceneChange(room);
      setScreen('playing');
    },
    [audio, dialogue],
  );
  const onStart = () => {
    resetSession(session);
    // Keyboard players get the controls card once, on their first start; touch explains itself (Q8).
    const keyboard = typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;
    if (keyboard && !prefs.seenControls) setControlsCard(true);
    begin(bootScene);
  };
  const onContinue = () => {
    if (save) begin(restoreCheckpoint(session, save.checkpoint));
  };
  const onRestart = () => {
    resetSession(session);
    begin(bootScene);
  };
  const onSound = (sound: SoundSettings) => {
    audio.setVolume('bgm', sound.bgm);
    audio.setVolume('sfx', sound.sfx);
    const next = { ...prefs, sound };
    setPrefs(next);
    void saveStore.writePreferences(next);
  };
  const onControlsCardClosed = () => {
    setControlsCard(false);
    const next = { ...prefs, seenControls: true };
    setPrefs(next);
    void saveStore.writePreferences(next);
  };
  // A record open pauses the game too (31 §0).
  const paused = screen !== 'playing' || controlsCard || recordOpen;
  useEffect(() => {
    if (paused) audio.stopLoops(); // the movement hum must not drone on under a menu
  }, [paused, audio]);
  // Companion chatter: short blips, cycling a/b/c, one per letter (asset room sfx v1).
  const blip = useRef(0);
  const onLetter = useCallback(
    (speaker: string) => {
      if (speaker !== 'companion') return;
      soundQueue.sfx(`companion-blip-${'abc'[blip.current++ % 3]}`);
    },
    [soundQueue],
  );
  const ui = (run: () => void) => () => {
    audio.playSfx('ui-confirm');
    run();
  };

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
        paused={paused}
        style={gameStyle}
        onReady={(engine) => {
          engineRef.current = engine;
          setScreen(skipTitle ? 'playing' : 'title');
        }}
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
          const sounds = await loadSoundManifest(ASSET_BASE_URL);
          records.setRecords(await loadRecords(ASSET_BASE_URL + RECORDS_FILE));
          hintDefs.current = await loadHints(`${ASSET_BASE_URL}data/hints.json`);
          registerRoguelite(api, textures, whitePixelTexture, formTextures, session, Math.random, tilesetTextures, animAssets, combat, { scripts, registry, dialogue, sound: soundQueue, roomBgm: sounds.rooms, records, hints: { controller: hints, defs: () => hintDefs.current } });
          api.registerScenes([{ name: TITLE_SCENE, setup: () => undefined }]);
          void preloadSounds(audio, sounds, ASSET_BASE_URL); // decodes in the background; the game doesn't wait
          api.registerSystems({
            simulation: [createRunScenarioSystem({ textures, random: Math.random, formTextures, session, dialogueStore }), createSoundDirectorSystem(soundQueue, sounds.tags)],
            render: [
              createMonsterCountSystem(monsterCountStore),
              createCombatDebugSystem(combatDebugStore, { maxHp: combat.childHealth.maxHp, maxEmbers: combat.embers.max }),
              createTouchFeedSystem(combat, touchViewStore, touchAim),
              createTouchAimPreviewSystem(combat, touchAim, whitePixelTexture),
              createSoundSystem(soundQueue, audio),
            ],
          });
          setSpellRanges({ quick: combat.spells.quick.range, cast: combat.spells.cast.maxAimRange });
          return skipTitle ? bootScene : TITLE_SCENE;
        }}
      >
        {debug && <MonsterCountHud store={monsterCountStore} />}
        <DialogueBox store={dialogueStore} />
        {debug && <CombatDebugHud store={combatDebugStore} />}
      </GameCanvas>
      {/* Landscape: over the whole screen. Portrait: the control area under the game box. */}
      <div style={uiStyle}>
        {spellRanges && (
          <TouchControls
            virtual={virtualControls}
            view={touchViewStore}
            aim={touchAim}
            quickRange={spellRanges.quick}
            castRange={spellRanges.cast}
            mode={touch}
            pulse={hint?.def.touch}
            onActiveChange={setTouchActive}
          />
        )}
        {/* After the touch layer, so a tap on the box (walking chatter) reaches it. */}
        <DialoguePanel controller={dialogue} speakers={speakers} fontBaseUrl={`${ASSET_BASE_URL}fonts/`} placement={portrait ? 'top' : 'bottom'} onLetter={onLetter} />
      </div>
      <HintPanel controller={hints} touch={touchActive} art={hintArt} gameBox={{ left: game.left, top: portrait ? 'env(safe-area-inset-top, 0px)' : game.top, width: game.width, height: game.height }} />
      <RecordPanel
        controller={records}
        gameBox={{ left: game.left, top: portrait ? 'env(safe-area-inset-top, 0px)' : game.top, width: game.width, height: game.height }}
        art={{ glyphs: `${ASSET_BASE_URL}ui/lore/glyphs.png`, frame: `${ASSET_BASE_URL}ui/lore/record-frame.png` }}
        onOpen={() => audio.playSfx('record-open')}
        onClose={() => audio.playSfx('record-close')}
      />
      <GameShell
        screen={screen}
        title={DEMO_TITLE}
        version={DEMO_VERSION}
        canContinue={save !== undefined}
        sound={prefs.sound}
        controlsCard={controlsCard}
        onStart={ui(onStart)}
        onContinue={ui(onContinue)}
        onPause={ui(() => setScreen('paused'))}
        onResume={ui(() => setScreen('playing'))}
        onRestart={ui(onRestart)}
        onSound={onSound}
        onControlsCardClosed={onControlsCardClosed}
        gameBox={{ left: game.left, top: portrait ? 'env(safe-area-inset-top, 0px)' : game.top, width: game.width, height: game.height }}
        titleArt={titleArt}
      />
    </div>
  );
}
