'use client';
import { createSnapshotStore, createWhitePixelTexture, GameCanvas, loadTextures } from '@g-game-farm/ribs';
import { useMemo } from 'react';
import { ROGUELITE_ASSET_MANIFEST } from './assets.js';
import { registerRoguelite, ROGUELITE_BOOT_SCENE, ROGUELITE_LAYERS } from './bootstrap.js';
import { ROGUELITE_CANVAS_SIZE } from './camera.js';
import { MonsterCountHud } from './monster-count-hud.js';
import { createMonsterCountSystem } from './systems/monster-count-hud.js';

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
 */
export function RogueliteGame({ showDevHud = false }: RogueliteGameProps) {
  const monsterCountStore = useMemo(() => createSnapshotStore(0), []);

  return (
    <GameCanvas
      width={ROGUELITE_CANVAS_SIZE.width}
      height={ROGUELITE_CANVAS_SIZE.height}
      layers={ROGUELITE_LAYERS}
      showDevHud={showDevHud}
      setup={async (api, renderer) => {
        const textures = await loadTextures(renderer, ROGUELITE_ASSET_MANIFEST, ASSET_BASE_URL);
        const whitePixelTexture = createWhitePixelTexture(renderer);
        registerRoguelite(api, textures, whitePixelTexture);
        api.registerSystems({ render: [createMonsterCountSystem(monsterCountStore)] });
        return ROGUELITE_BOOT_SCENE;
      }}
    >
      <MonsterCountHud store={monsterCountStore} />
    </GameCanvas>
  );
}
