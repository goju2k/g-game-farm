'use client';
import { createSnapshotStore, createWhitePixelTexture, GameCanvas, loadTextures } from '@g-game-farm/ribs';
import { useMemo } from 'react';
import { ROGUELITE_ASSET_MANIFEST } from './assets.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE, ROGUELITE_LAYERS } from './bootstrap.js';
import { ROGUELITE_CANVAS_SIZE } from './camera.js';
import { createFlameSpiritPlaceholderTexture } from './player/flame-spirit-placeholder-texture.js';
import { EMPTY_DIALOGUE_STATE } from './scenario/dialogue-state.js';
import { createRogueliteSession } from './session.js';
import { createMonsterCountSystem } from './systems/monster-count-hud.js';
import { createRunScenarioSystem } from './systems/run-scenario.js';
import { DialogueBox } from './ui/dialogue-box.js';
import { MonsterCountHud } from './ui/monster-count-hud.js';

/** Where this widget's own copy of the game's assets is served from — see this package's public/game/. */
const ASSET_BASE_URL = '/game/';

export interface RogueliteGameProps {
  readonly showDevHud?: boolean;
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
export function RogueliteGame({ showDevHud = false }: RogueliteGameProps) {
  const monsterCountStore = useMemo(() => createSnapshotStore(0), []);
  const dialogueStore = useMemo(() => createSnapshotStore(EMPTY_DIALOGUE_STATE), []);
  const session = useMemo(() => createRogueliteSession(), []);

  return (
    <GameCanvas
      width={ROGUELITE_CANVAS_SIZE.width}
      height={ROGUELITE_CANVAS_SIZE.height}
      layers={ROGUELITE_LAYERS}
      showDevHud={showDevHud}
      setup={async (api, renderer) => {
        const textures = await loadTextures(renderer, ROGUELITE_ASSET_MANIFEST, ASSET_BASE_URL);
        const whitePixelTexture = createWhitePixelTexture(renderer);
        const formTextures = { mage: textures.player, flame: createFlameSpiritPlaceholderTexture(renderer) };

        registerRoguelite(api, textures, whitePixelTexture, formTextures, session);
        api.registerSystems({
          simulation: [createRunScenarioSystem({ textures, random: Math.random, formTextures, session, dialogueStore })],
          render: [createMonsterCountSystem(monsterCountStore)],
        });
        return ROGUELITE_BOOT_SCENE;
      }}
    >
      <MonsterCountHud store={monsterCountStore} />
      <DialogueBox store={dialogueStore} />
    </GameCanvas>
  );
}
