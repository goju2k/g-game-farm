'use client';
import type { Engine, InputCapture } from '@g-game-farm/engine';
import { useEffect, useRef } from 'react';

export interface UseGameLoopOptions {
  /** Clamps a single tick()'s deltaMs (e.g. after tab backgrounding) so the simulation can't "fast-forward" through the backlog. Default 250 — comfortably above a normal frame's substep budget. */
  readonly maxFrameDeltaMs?: number;
  /** Called once per real frame, right after engine.tick(). Never write React state here per-frame — write to a ref/DOM node directly (see GameCanvas's dev HUD), matching this project's no-per-frame-useState rule. */
  readonly onFrame?: (info: { readonly deltaMs: number; readonly frameCount: number }) => void;
}

const DEFAULT_MAX_FRAME_DELTA_MS = 250;

/**
 * Drives an already-constructed Engine's requestAnimationFrame loop:
 * capture.poll() -> engine.tick(), every frame, until unmount. `engine`/
 * `capture` may start undefined (e.g. GameCanvas is still awaiting its
 * async setup()) — the loop starts once both are defined and stops (and
 * restarts cleanly) whenever either identity changes, including going back
 * to undefined. Does not call `capture.dispose()` — the caller that
 * constructed it owns disposal, since it also owns construction.
 */
export function useGameLoop(
  engine: Engine | undefined,
  capture: InputCapture | undefined,
  options: UseGameLoopOptions = {},
): void {
  const { maxFrameDeltaMs = DEFAULT_MAX_FRAME_DELTA_MS, onFrame } = options;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!engine || !capture) {
      return;
    }

    let rafId = 0;
    let lastTime: number | undefined;
    let frameCount = 0;

    const frame = (time: number) => {
      rafId = requestAnimationFrame(frame);

      const rawDelta = lastTime === undefined ? 0 : time - lastTime;
      lastTime = time;
      const deltaMs = Math.min(rawDelta, maxFrameDeltaMs);

      engine.tick(deltaMs, capture.poll());
      frameCount++;
      onFrameRef.current?.({ deltaMs, frameCount });
    };
    rafId = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(rafId);
  }, [engine, capture, maxFrameDeltaMs]);
}
