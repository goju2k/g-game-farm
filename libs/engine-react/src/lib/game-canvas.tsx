'use client';
import { createEngine, createInputCapture, type Engine, type EngineRenderer, type InputCapture, type LayerConfig, type PluginApi } from '@g-game-farm/engine';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameLoop } from './use-game-loop.js';

export interface GameCanvasProps {
  /**
   * Fixed size in CSS pixels. Omit both to fill whatever size the parent
   * DOM element gives this component (`width: 100%; height: 100%`) — the
   * default, since an embeddable widget's host page usually owns layout.
   * Either way, the actual on-screen size (and the canvas's backing-store
   * resolution, and every system's `ctx.canvasSize`) is driven live by a
   * ResizeObserver on this component's own wrapper element, not by these
   * props directly — passing fixed numbers just gives that wrapper an
   * explicit CSS size to observe instead of `100%`.
   */
  readonly width?: number;
  readonly height?: number;
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
 * layers/setup are read ONCE at mount — there is no live-reconfigure story
 * for those yet. width/height are different: they only ever seed the
 * wrapper element's CSS size, and the actual live size (on-screen, the
 * canvas's backing-store resolution, and every system's ctx.canvasSize) is
 * always driven by a ResizeObserver on that wrapper — so the canvas already
 * tracks its container continuously, whether that container is `100%` of a
 * resizable host layout or a fixed pixel box.
 */
export function GameCanvas({ width, height, layers, setup, maxFrameDeltaMs, showDevHud = false, children, className, style }: GameCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState<{ readonly engine: Engine; readonly capture: InputCapture } | undefined>(undefined);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }

    // The Renderer's constructor reads canvas.width/height once, synchronously, to seed
    // its own canvasSize — that has to already be the wrapper's real size (not the
    // browser's 300x150 canvas default) before createEngine() runs, since the
    // ResizeObserver below only reports asynchronously, on a later frame.
    canvas.width = Math.round(wrapper.clientWidth);
    canvas.height = Math.round(wrapper.clientHeight);

    const engine = createEngine({ render: { canvas, layers } });
    const capture = createInputCapture({ target: canvas });
    let cancelled = false;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      // A host page whose layout hasn't settled yet (or is simply misconfigured) can
      // report a momentarily/permanently collapsed 0-size container — skip rather than
      // hand the renderer a 0 that propagates into NaN in projection math (division by
      // canvas height).
      if (nextWidth === 0 || nextHeight === 0) {
        return;
      }
      if (canvas.width === nextWidth && canvas.height === nextHeight) {
        return;
      }
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      engine.renderer.resize(nextWidth, nextHeight);
    });
    resizeObserver.observe(wrapper);

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
      resizeObserver.disconnect();
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
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: width ?? '100%', height: height ?? '100%', ...style }}
      className={className}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
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
