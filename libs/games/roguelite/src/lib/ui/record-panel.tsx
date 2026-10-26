'use client';
import { useSnapshotStore } from '@g-game-farm/ribs';
import { useEffect, type CSSProperties } from 'react';
import { glyphStrokes, toGlyphs } from '../records/glyphs.js';
import type { RecordController } from '../records/record-controller.js';

export interface RecordPanelProps {
  readonly controller: RecordController;
  /** Where the game box is (CSS px): the panel sits over it. */
  readonly gameBox: { readonly left: number; readonly top: number | string; readonly width: number; readonly height: number };
  /** The asset room's lore art (ui/lore): the glyph sheet (40 white 9x9 glyphs, 8 per row in 10px cells) and the 9-slice stone frame. Without them: drawn stand-ins. */
  readonly art?: { readonly glyphs: string; readonly frame: string };
  /** The panel opened / closed (its sounds). */
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
}

const INK = '#cbdbfc';
const GLYPH_INK = '#9fb6e8';
/** Glyphs at 2x their 9px art (integer scale: crisp). */
const GLYPH_SCALE = 2;
const GLYPH_PX = 9 * GLYPH_SCALE;
/** The glyph sheet: 8 glyphs per row, 10px cells. */
const SHEET_COLUMNS = 8;
const SHEET_CELL = 10;
/** The frame: 48px, 16px slices, at 2x. */
const FRAME_SLICE = 16;
const FRAME_SCALE = 2;

/**
 * The record panel (demo level design 31 §0): a stone slab — not the
 * companion's dialogue box — with the record in the ancient glyphs (or as
 * written once deciphered). The game is paused while it's open; a tap,
 * click, Space, Enter, E or Esc closes it.
 */
export function RecordPanel({ controller, gameBox, art, onOpen, onClose }: RecordPanelProps) {
  const { open } = useSnapshotStore(controller.view);
  const seq = open?.seq;
  useEffect(() => {
    if (seq === undefined) return;
    onOpen?.();
    return () => onClose?.();
  }, [seq]);

  useEffect(() => {
    if (!open) return;
    const close = () => controller.close(open.seq);
    const onKey = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'KeyE', 'Escape'].includes(e.code)) {
        e.stopPropagation();
        close();
      }
    };
    // Next frame: the press that opened it mustn't close it.
    const timer = setTimeout(() => {
      window.addEventListener('keydown', onKey, { capture: true });
      window.addEventListener('pointerdown', close, { capture: true });
    }, 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey, { capture: true });
      window.removeEventListener('pointerdown', close, { capture: true });
    };
  }, [open, controller]);

  if (!open) return null;
  const slab: CSSProperties = {
    position: 'absolute',
    left: gameBox.left,
    top: gameBox.top,
    width: gameBox.width,
    height: gameBox.height,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(5,4,10,0.55)',
    pointerEvents: 'auto',
    touchAction: 'none',
  };
  return (
    <div style={slab}>
      <div
        style={{
          maxWidth: '84%',
          color: INK,
          font: "16px/1.6 'Galmuri11', monospace",
          ...(art
            ? {
                padding: '10px 14px',
                borderStyle: 'solid',
                borderWidth: FRAME_SLICE * FRAME_SCALE,
                borderImage: `url(${art.frame}) ${FRAME_SLICE} fill / ${FRAME_SLICE * FRAME_SCALE}px round`,
                imageRendering: 'pixelated',
                filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
              }
            : {
                padding: '18px 22px',
                background: 'linear-gradient(160deg, #3a3846 0%, #2a2934 55%, #22212b 100%)',
                border: '3px solid #5a5868',
                outline: '2px solid #17161d',
                boxShadow: 'inset 0 0 0 2px #45434f, inset 0 0 18px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.6)',
              }),
        }}
      >
        {open.readable ? (
          <div>{open.text}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 3px', alignItems: 'center' }} aria-label="읽을 수 없는 고대 문자">
            {toGlyphs(open.text).map((cell, i) =>
              cell.kind === 'space' ? (
                <span key={i} style={{ width: GLYPH_PX * 0.6 }} />
              ) : cell.kind === 'mark' ? (
                <span key={i} style={{ width: 4, height: 4, marginTop: GLYPH_PX - 4, background: INK, opacity: 0.6 }} />
              ) : art ? (
                // The sheet's white glyph as a mask over the ink colour (the asset room's note: colour it in CSS).
                <span
                  key={i}
                  style={{
                    display: 'block',
                    width: GLYPH_PX,
                    height: GLYPH_PX,
                    background: GLYPH_INK,
                    maskImage: `url(${art.glyphs})`,
                    WebkitMaskImage: `url(${art.glyphs})`,
                    maskSize: `${SHEET_COLUMNS * SHEET_CELL * GLYPH_SCALE}px auto`,
                    WebkitMaskSize: `${SHEET_COLUMNS * SHEET_CELL * GLYPH_SCALE}px auto`,
                    maskPosition: `-${(cell.index % SHEET_COLUMNS) * SHEET_CELL * GLYPH_SCALE}px -${Math.floor(cell.index / SHEET_COLUMNS) * SHEET_CELL * GLYPH_SCALE}px`,
                    WebkitMaskPosition: `-${(cell.index % SHEET_COLUMNS) * SHEET_CELL * GLYPH_SCALE}px -${Math.floor(cell.index / SHEET_COLUMNS) * SHEET_CELL * GLYPH_SCALE}px`,
                    maskRepeat: 'no-repeat',
                    WebkitMaskRepeat: 'no-repeat',
                  }}
                />
              ) : (
                <svg key={i} width={GLYPH_PX} height={GLYPH_PX} viewBox="0 0 8 8" style={{ display: 'block' }}>
                  {glyphStrokes(cell.index).map(([x1, y1, x2, y2], j) => (
                    <line key={j} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9fb6e8" strokeWidth={1} strokeLinecap="square" />
                  ))}
                </svg>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
