'use client';
import { createEngine, createInputCapture, type Engine, type EngineRenderer, type InputCapture, type LayerConfig, type PluginApi } from '@g-game-farm/engine';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameLoop } from './use-game-loop.js';

export interface GameCanvasProps {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly LayerConfig[];
  /**
   * Loads assets, registers components/systems/scenes via `api`, and
   * resolves to the boot scene's name. Called exactly once per mount, after
   * the canvas + Engine + InputCapture exist but before the render loop
   * starts — generalizes "load textures, register, loadScene" without
   * GameCanvas needing to know what a texture or a game even is.
   */
  readonly setup: (api: PluginApi, renderer: EngineRenderer) => Promise<string>;
  readonly maxFrameDeltaMs?: number;
  /** Dev-only frame-counter overlay, off by default — a real game turns this on only while iterating. */
  readonly showDevHud?: boolean;
  /** Overlay UI composed on top of the canvas, inside the same positioned wrapper — e.g. a HUD. */
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Owns the canvas DOM node's lifecycle end to end: creates the Engine and
 * InputCapture, runs `setup()`, drives the requestAnimationFrame loop (via
 * useGameLoop), and cleans up on unmount. The consumer never calls
 * createEngine()/drives tick() itself — see the design conversation this
 * package's README/CLAUDE.md section documents: the "wraps everything"
 * component shape was chosen deliberately as the lower-barrier default for
 * typical web developers.
 *
 * width/height/layers/setup are read ONCE at mount, mirroring <canvas>'s
 * own width/height semantics — there is no live-reconfigure story yet.
 * Changing them after mount has no effect; unmount+remount to reconfigure.
 */
export function GameCanvas({ width, height, layers, setup, maxFrameDeltaMs, showDevHud = false, children, className, style }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState<{ readonly engine: Engine; readonly capture: InputCapture } | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const engine = createEngine({ render: { canvas, layers } });
    const capture = createInputCapture({ target: canvas });
    let cancelled = false;

    setup(engine, engine.renderer)
      .then((bootScene) => {
        if (cancelled) {
          return;
        }
        engine.loadScene(bootScene);
        setReady({ engine, capture });
      })
      .catch((err: unknown) => console.error('GameCanvas: setup() failed', err));

    return () => {
      cancelled = true;
      capture.dispose();
      engine.dispose();
      setReady(undefined);
    };
  }, []);

  useGameLoop(ready?.engine, ready?.capture, {
    maxFrameDeltaMs,
    onFrame: showDevHud
      ? ({ deltaMs, frameCount }) => {
          // Exponential moving average, not the raw instantaneous 1000/deltaMs — a per-frame
          // reading jitters too much (one slightly-late frame reads as a huge FPS swing) to be
          // readable. alpha=0.1 settles in ~1s at 60fps while still tracking real fluctuations,
          // not just displaying a stale long-run average.
          if (deltaMs > 0) {
            const instantFps = 1000 / deltaMs;
            fpsRef.current = fpsRef.current === undefined ? instantFps : fpsRef.current + (instantFps - fpsRef.current) * 0.1;
          }
          if (hudRef.current) {
            // Right-pad every number to a fixed width so a digit-count change (fps crossing
            // 99->100, say) doesn't reflow the line — with a collapsing div this would do
            // nothing, hence `whiteSpace: 'pre'` below to actually preserve the padding.
            const frameText = String(frameCount).padStart(6, ' ');
            const deltaText = deltaMs.toFixed(1).padStart(5, ' ');
            const fpsText = (fpsRef.current === undefined ? '-' : fpsRef.current.toFixed(0)).padStart(3, ' ');
            hudRef.current.textContent = `frame ${frameText}  Δ${deltaText}ms  ${fpsText} fps`;
          }
        }
      : undefined,
  });

  return (
    <div style={{ position: 'relative', width, height, ...style }} className={className}>
      <canvas ref={canvasRef} width={width} height={height} />
      {showDevHud && (
        <div
          ref={hudRef}
          style={{ position: 'absolute', top: 4, left: 4, color: '#0f0', font: '12px monospace', whiteSpace: 'pre', pointerEvents: 'none' }}
        />
      )}
      {children}
    </div>
  );
}
