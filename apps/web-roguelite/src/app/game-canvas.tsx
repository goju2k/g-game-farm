'use client';

import { createEngine, createInputCapture } from '@g-game-farm/engine';
import { registerRoguelite, ROGUELITE_BOOT_SCENE, ROGUELITE_LAYERS } from '@g-game-farm/roguelite';
import { useEffect, useRef } from 'react';
import { loadRogueliteTextures } from './load-roguelite-textures';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

/**
 * A real-time gap (e.g. the tab was backgrounded for a while) shouldn't be
 * handed to Engine.tick() as-is — Engine.maxSubStepsPerFrame only bounds how
 * many fixed steps run *per tick() call*, so a huge deltaMs just spreads the
 * backlog across many subsequent frames, "fast-forwarding" the game for a
 * few seconds after the tab regains focus. Clamping deltaMs here means that
 * backlog never accumulates in the first place — comfortably above a normal
 * frame's worth of substeps (maxSubStepsPerFrame(5) * fixedDeltaMs(~16.7ms)
 * ~= 83ms), so ordinary frame drops still pass through untouched.
 */
const MAX_FRAME_DELTA_MS = 250;

/**
 * Owns the canvas DOM node's lifecycle and nothing else — creates the
 * engine, drives the requestAnimationFrame loop, and cleans up on unmount.
 * No game logic lives here (see CLAUDE.md's UI architecture principle).
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const engine = createEngine({ render: { canvas, layers: ROGUELITE_LAYERS } });
    const capture = createInputCapture({ target: canvas });

    // Texture loading is async, but a useEffect callback must return a
    // plain cleanup function (not a Promise) — so scene setup and the rAF
    // loop only start once loadRogueliteTextures() resolves, inside its
    // .then(). `cancelled` guards against the effect having already been
    // cleaned up (unmount, or a future StrictMode re-enable) by the time
    // that resolves.
    let cancelled = false;
    let rafId = 0;

    loadRogueliteTextures(engine.renderer)
      .then((textures) => {
        if (cancelled) {
          return;
        }

        registerRoguelite(engine, textures);
        engine.loadScene(ROGUELITE_BOOT_SCENE);

        let lastTime: number | undefined;
        let frameCount = 0;

        const frame = (time: number) => {
          rafId = requestAnimationFrame(frame);

          const rawDelta = lastTime === undefined ? 0 : time - lastTime;
          lastTime = time;
          const deltaMs = Math.min(rawDelta, MAX_FRAME_DELTA_MS);

          engine.tick(deltaMs, capture.poll());
          frameCount++;

          // Dev-only liveness indicator — a static and a per-frame-redrawn black
          // canvas look identical, so this proves the loop is actually running.
          // Imperative textContent, not React state: CLAUDE.md's UI principle
          // says per-frame updates never go through useState. Fine to delete
          // once real gameplay is visible on screen.
          if (hudRef.current) {
            hudRef.current.textContent = `frame ${frameCount}  Δ${deltaMs.toFixed(1)}ms`;
          }
        };
        rafId = requestAnimationFrame(frame);
      })
      .catch((err: unknown) => {
        console.error('roguelite: failed to load textures', err);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      capture.dispose();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <div
        ref={hudRef}
        style={{ position: 'absolute', top: 4, left: 4, color: '#0f0', font: '12px monospace', pointerEvents: 'none' }}
      />
    </div>
  );
}
