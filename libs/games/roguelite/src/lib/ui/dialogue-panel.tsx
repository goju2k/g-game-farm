'use client';
import { useSnapshotStore } from '@g-game-farm/ribs';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseLine, type DialogueController } from '../events/dialogue-controller.js';

/** A speaker's label in the panel (event script `speakers`). */
export interface SpeakerStyle {
  readonly name: string;
  readonly color: string;
}

export interface DialoguePanelProps {
  readonly controller: DialogueController;
  readonly speakers: Readonly<Record<string, SpeakerStyle>>;
  /** Where Galmuri11.woff2 is served (asset base + "fonts/"). */
  readonly fontBaseUrl: string;
  /**
   * 'bottom' (landscape): along the bottom of the screen, at most 22% tall.
   * 'top' (portrait): at the top of the parent — the control area right under
   * the game box — with no height cap; the skip button sits just above it,
   * inside the game box's bottom-right corner (touch spec §7).
   */
  readonly placement?: 'bottom' | 'top';
  /** Called for each letter typed (not spaces or punctuation), with the line's speaker — the companion's chatter sound. */
  readonly onLetter?: (speaker: string) => void;
}

const CHARS_PER_SECOND = 30;
const COMMA_PAUSE_MS = 100;
const STOP_PAUSE_MS = 250;
/** A line said while the player can move (walking chatter) closes itself this long after it's fully shown. */
const UNLOCKED_LINGER_MS = 3000;
const SKIP_HOLD_MS = 1000;

/**
 * The bottom dialogue box (event spec §5): types a line, then waits. While a
 * scene holds the input, a tap anywhere / Space / click advances (first
 * finishing the line). A line said while the player can move only takes
 * taps on the box itself (so the touch controls keep working) and closes on
 * its own after a while. Long-press "건너뛰기" (1s) skips the whole scene.
 */
export function DialoguePanel({ controller, speakers, fontBaseUrl, placement = 'bottom', onLetter }: DialoguePanelProps) {
  const onLetterRef = useRef(onLetter);
  onLetterRef.current = onLetter;
  const view = useSnapshotStore(controller.view);
  const line = view.line;
  const [shown, setShown] = useState('');
  const [typing, setTyping] = useState(false);
  const finishRef = useRef<() => void>(() => undefined);
  const [skipProgress, setSkipProgress] = useState(0);

  // Typewriter: walk the line's parts on timers; {dim} reports back as it's reached.
  useEffect(() => {
    if (!line) return;
    const parts = parseLine(line.text);
    let partIndex = 0;
    let charIndex = 0;
    let text = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    setShown('');
    setTyping(true);

    const complete = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      // Apply any {dim} not yet reached, then show everything.
      for (let p = partIndex; p < parts.length; p++) if (parts[p].kind === 'dim') controller.dim(line.seq);
      setShown(parts.map((part) => (part.kind === 'text' ? part.text : '')).join(''));
      setTyping(false);
      const linger = line.autoMs ?? (line.locked ? undefined : UNLOCKED_LINGER_MS);
      if (linger !== undefined) timer = setTimeout(() => controller.complete(line.seq), linger);
    };
    finishRef.current = complete;

    const step = () => {
      const part = parts[partIndex];
      if (!part) return complete();
      if (part.kind === 'pause') {
        partIndex++;
        timer = setTimeout(step, part.ms);
        return;
      }
      if (part.kind === 'dim') {
        controller.dim(line.seq);
        partIndex++;
        return step();
      }
      const ch = part.text[charIndex];
      text += ch;
      if (!/[\s.,!?…~'"“”‘’()\-—]/.test(ch)) onLetterRef.current?.(line.speaker);
      setShown(text);
      charIndex++;
      if (charIndex >= part.text.length) {
        partIndex++;
        charIndex = 0;
      }
      const extra = ch === ',' ? COMMA_PAUSE_MS : ch === '.' || ch === '…' || ch === '!' || ch === '?' ? STOP_PAUSE_MS : 0;
      timer = setTimeout(step, 1000 / CHARS_PER_SECOND + extra);
    };
    step();
    return () => {
      done = true;
      if (timer) clearTimeout(timer);
    };
  }, [line, controller]);

  const advance = () => {
    if (!line) return;
    if (typing) finishRef.current();
    else controller.complete(line.seq);
  };

  // Scene dialogue: tap anywhere / Space / click.
  useEffect(() => {
    if (!line?.locked) return;
    const onPointer = () => advance();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') advance();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  });

  // Long-press skip.
  const holdTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startHold = (e: React.PointerEvent) => {
    e.stopPropagation();
    const started = performance.now();
    holdTimer.current = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / SKIP_HOLD_MS);
      setSkipProgress(progress);
      if (progress >= 1) {
        stopHold();
        controller.requestSkip();
      }
    }, 30);
  };
  const stopHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = undefined;
    setSkipProgress(0);
  };

  const font = `@font-face { font-family: 'Galmuri11'; src: url('${fontBaseUrl}Galmuri11.woff2') format('woff2'); font-display: swap; }`;
  const speaker = line ? speakers[line.speaker] : undefined;
  const panel: CSSProperties = {
    position: 'absolute',
    left: 'calc(env(safe-area-inset-left, 0px) + 12px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
    ...(placement === 'top' ? { top: 8 } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)', maxHeight: '22%' }),
    minHeight: 56,
    boxSizing: 'border-box',
    padding: '10px 14px',
    background: 'rgba(8,7,14,0.88)',
    border: '2px solid rgba(203,219,252,0.35)',
    color: '#eef0ff',
    font: "15px/1.5 'Galmuri11', monospace",
    pointerEvents: 'auto',
    userSelect: 'none',
    overflow: 'hidden',
  };

  return (
    <>
      <style>{font}</style>
      {line && (
        <div style={panel} onPointerDown={line.locked ? undefined : (e) => (e.stopPropagation(), advance())}>
          {speaker && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: speaker.color, fontSize: 13, marginBottom: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: speaker.color, boxShadow: `0 0 6px ${speaker.color}` }} />
              {speaker.name}
            </div>
          )}
          <div>
            {shown}
            {!typing && <span style={{ opacity: 0.6 }}> ▾</span>}
          </div>
        </div>
      )}
      {view.skippable && (
        <div
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
          style={{
            position: 'absolute',
            right: 'calc(env(safe-area-inset-right, 0px) + 14px)',
            ...(placement === 'top' ? { top: -36 } : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 22% + 18px)' }),
            padding: '6px 10px',
            border: '1px solid rgba(203,219,252,0.45)',
            borderRadius: 4,
            color: '#cbdbfc',
            font: "13px 'Galmuri11', monospace",
            background: `linear-gradient(to right, rgba(203,219,252,0.35) ${skipProgress * 100}%, rgba(8,7,14,0.6) ${skipProgress * 100}%)`,
            pointerEvents: 'auto',
            userSelect: 'none',
          }}
        >
          건너뛰기 ▸▸
        </div>
      )}
    </>
  );
}
