'use client';
import { useSnapshotStore } from '@g-game-farm/ribs';
import { useEffect, type CSSProperties } from 'react';
import { glyphStrokes, toGlyphs } from '../records/glyphs.js';
import type { RecordController } from '../records/record-controller.js';

export interface RecordPanelProps {
  readonly controller: RecordController;
  /** Where the game box is (CSS px): the panel sits over it. */
  readonly gameBox: { readonly left: number; readonly top: number | string; readonly width: number; readonly height: number };
}

const INK = '#cbdbfc';
const GLYPH_PX = 14;

/**
 * The record panel (demo level design 31 §0): a stone slab — not the
 * companion's dialogue box — with the record in the ancient glyphs (or as
 * written once deciphered). The game is paused while it's open; a tap,
 * click, Space, Enter, E or Esc closes it.
 */
export function RecordPanel({ controller, gameBox }: RecordPanelProps) {
  const { open } = useSnapshotStore(controller.view);

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
          padding: '18px 22px',
          background: 'linear-gradient(160deg, #3a3846 0%, #2a2934 55%, #22212b 100%)',
          border: '3px solid #5a5868',
          outline: '2px solid #17161d',
          boxShadow: 'inset 0 0 0 2px #45434f, inset 0 0 18px rgba(0,0,0,0.6), 0 6px 18px rgba(0,0,0,0.6)',
          color: INK,
          font: "16px/1.6 'Galmuri11', monospace",
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
