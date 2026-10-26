'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SoundSettings } from '../save/save-game.js';

/**
 * The screens around play (demo plan §4, Q3/Q4/Q8/Q9): loading, title
 * (dark → a blue ember flickers on → the title → menu), pause, sound
 * settings and the controls card. Pure UI: it only reports choices — what
 * "start" or "continue" does to the game is the caller's.
 */

export type ShellScreen = 'loading' | 'title' | 'playing' | 'paused';

/** The title's background art: a looping strip of frames (an anim asset's clip) plus its lamps' light, in art pixels. */
export interface TitleArt {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly { readonly sx: number; readonly sy: number; readonly durationMs: number }[];
  readonly lamps: readonly { readonly x: number; readonly y: number; readonly radius: number }[];
}

export interface GameShellProps {
  readonly screen: ShellScreen;
  readonly title: string;
  readonly version: string;
  readonly canContinue: boolean;
  readonly sound: SoundSettings;
  /** Show the controls card (the first start with a keyboard, Q8). */
  readonly controlsCard: boolean;
  readonly onStart: () => void;
  readonly onContinue: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onRestart: () => void;
  readonly onSound: (sound: SoundSettings) => void;
  readonly onControlsCardClosed: () => void;
  /** Where the game box is (CSS px) — the pause button sits in its top-right corner. */
  readonly gameBox: { readonly left: number; readonly top: number | string; readonly width: number; readonly height: number };
  readonly titleArt?: TitleArt;
}

const INK = '#cbdbfc';
const BG = '#05040a';
const FONT = "'Galmuri11', monospace";
const EMBER = '#7ec8ff';

type Panel = 'none' | 'sound' | 'controls';

export function GameShell(props: GameShellProps) {
  const { screen } = props;
  const [panel, setPanel] = useState<Panel>('none');
  // Title stages: 0 dark, 1 ember, 2 title text, 3 menu. Any tap jumps to the menu.
  const [stage, setStage] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (screen !== 'title') return;
    setStage(0);
    setPanel('none');
    timers.current = [setTimeout(() => setStage(1), 600), setTimeout(() => setStage(2), 2200), setTimeout(() => setStage(3), 3200)];
    return () => timers.current.forEach(clearTimeout);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'paused') setPanel('none');
  }, [screen]);

  // Esc: pause / back / resume.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      if (panel !== 'none') setPanel('none');
      else if (screen === 'playing') props.onPause();
      else if (screen === 'paused') props.onResume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fill: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'auto', touchAction: 'none', userSelect: 'none', font: `15px/1.5 ${FONT}`, color: INK };

  if (props.controlsCard && screen === 'playing') {
    return (
      <div style={{ ...fill, background: 'rgba(5,4,10,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onPointerDown={(e) => e.stopPropagation()}>
        <Card title="조작" onClose={props.onControlsCardClosed} closeLabel="시작하기">
          <Controls />
        </Card>
      </div>
    );
  }

  if (screen === 'loading') {
    return (
      <div style={{ ...fill, background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <style>{KEYFRAMES}</style>
        <Ember size={8} />
        <div style={{ fontSize: 13, opacity: 0.6 }}>불러오는 중…</div>
      </div>
    );
  }

  if (screen === 'title') {
    return (
      <div
        style={{ ...fill, background: BG, overflow: 'hidden' }}
        onPointerDown={() => {
          if (stage < 3) {
            timers.current.forEach(clearTimeout);
            setStage(3);
          }
        }}
      >
        <style>{KEYFRAMES}</style>
        {props.titleArt && props.gameBox.width > 0 ? (
          <TitleBackground art={props.titleArt} box={props.gameBox} visible={stage >= 1} />
        ) : (
          // No art: far-off seal lamps as dots, cold and still.
          LAMPS.map(([x, y], i) => (
            <div key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 3, height: 3, borderRadius: 2, background: '#8fa6d8', boxShadow: '0 0 8px 2px rgba(120,150,220,0.35)', opacity: stage >= 1 ? 0.45 : 0, transition: 'opacity 2s' }} />
          ))
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>{stage >= 1 && <Ember size={10} flicker />}</div>
          <div style={{ fontSize: 34, letterSpacing: 8, opacity: stage >= 2 ? 1 : 0, transition: 'opacity 1s', textShadow: `0 0 18px rgba(126,200,255,0.35)` }}>{props.title}</div>
          <div style={{ minHeight: 170, opacity: stage >= 3 ? 1 : 0, transition: 'opacity 0.6s', pointerEvents: stage >= 3 ? 'auto' : 'none' }}>
            {panel === 'none' ? (
              <Menu
                items={[
                  ['시작', props.onStart],
                  ...(props.canContinue ? ([['이어하기', props.onContinue]] as const) : []),
                  ['소리', () => setPanel('sound')],
                  ['조작', () => setPanel('controls')],
                ]}
              />
            ) : (
              <PanelView panel={panel} sound={props.sound} onSound={props.onSound} onClose={() => setPanel('none')} />
            )}
          </div>
        </div>
        <div style={{ position: 'absolute', right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)', fontSize: 11, opacity: 0.4 }}>{props.version}</div>
      </div>
    );
  }

  if (screen === 'paused') {
    return (
      <div style={{ ...fill, background: 'rgba(5,4,10,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onPointerDown={(e) => e.stopPropagation()}>
        {panel === 'none' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 13, opacity: 0.6, letterSpacing: 4 }}>일시정지</div>
            <Menu
              items={[
                ['계속', props.onResume],
                ['처음부터', props.onRestart],
                ['소리', () => setPanel('sound')],
                ['조작', () => setPanel('controls')],
              ]}
            />
          </div>
        ) : (
          <PanelView panel={panel} sound={props.sound} onSound={props.onSound} onClose={() => setPanel('none')} />
        )}
      </div>
    );
  }

  // Playing: just the pause button, in the game box's top-right corner.
  const box = props.gameBox;
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        props.onPause();
      }}
      aria-label="일시정지"
      style={{
        position: 'absolute',
        left: box.left + box.width - 40,
        top: typeof box.top === 'number' ? box.top + 6 : `calc(${box.top} + 6px)`,
        width: 32,
        height: 32,
        borderRadius: 6,
        border: '1px solid rgba(203,219,252,0.35)',
        background: 'rgba(5,4,10,0.35)',
        color: INK,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: `14px ${FONT}`,
        pointerEvents: 'auto',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    >
      Ⅱ
    </div>
  );
}

const KEYFRAMES = `
@keyframes shell-flicker { 0% { opacity: 0 } 8% { opacity: .9 } 12% { opacity: .2 } 20% { opacity: 1 } 26% { opacity: .5 } 34% { opacity: 1 } 100% { opacity: 1 } }
@keyframes shell-breathe { 0%, 100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.15); opacity: 1 } }
`;

/** Cold far-off lamps on the title (x%, y%). */
const LAMPS: readonly (readonly [number, number])[] = [
  [14, 30],
  [22, 64],
  [78, 26],
  [86, 58],
  [64, 78],
  [36, 82],
];

/** The title art in the game box (same integer scale as play), fading in with the ember; lamps glow over it. */
function TitleBackground({ art, box, visible }: { art: TitleArt; box: GameShellProps['gameBox']; visible: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setFrame((f) => (f + 1) % art.frames.length), art.frames[frame]?.durationMs ?? 250);
    return () => clearTimeout(timer);
  }, [frame, art]);
  const scale = box.width / art.width;
  const sheetWidth = Math.max(...art.frames.map((f) => f.sx)) + art.width;
  const sheetHeight = Math.max(...art.frames.map((f) => f.sy)) + art.height;
  const current = art.frames[frame] ?? art.frames[0];
  return (
    <div
      style={{
        position: 'absolute',
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        opacity: visible ? 1 : 0,
        transition: 'opacity 2.4s',
        backgroundImage: `url(${art.url})`,
        backgroundSize: `${sheetWidth * scale}px ${sheetHeight * scale}px`,
        backgroundPosition: `${-current.sx * scale}px ${-current.sy * scale}px`,
        imageRendering: 'pixelated',
        pointerEvents: 'none',
      }}
    >
      {art.lamps.map((lamp, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: (lamp.x - lamp.radius) * scale,
            top: (lamp.y - lamp.radius) * scale,
            width: lamp.radius * 2 * scale,
            height: lamp.radius * 2 * scale,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(120,170,255,0.28) 0%, rgba(120,170,255,0.1) 45%, rgba(120,170,255,0) 70%)',
            mixBlendMode: 'screen',
          }}
        />
      ))}
    </div>
  );
}

function Ember({ size, flicker = false }: { size: number; flicker?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#e8f6ff',
        boxShadow: `0 0 ${size}px ${size / 2}px ${EMBER}, 0 0 ${size * 4}px ${size}px rgba(126,200,255,0.25)`,
        animation: flicker ? 'shell-flicker 1.4s ease-out both, shell-breathe 2.4s 1.4s ease-in-out infinite' : 'shell-breathe 1.6s ease-in-out infinite',
      }}
    />
  );
}

function Menu({ items }: { items: readonly (readonly [string, () => void])[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      {items.map(([label, run]) => (
        <button
          key={label}
          type="button"
          onClick={run}
          style={{ font: `17px ${FONT}`, color: INK, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '6px 22px', cursor: 'pointer', minWidth: 140 }}
          onPointerEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(203,219,252,0.4)')}
          onPointerLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children, onClose, closeLabel = '닫기' }: { title: string; children: ReactNode; onClose: () => void; closeLabel?: string }) {
  return (
    <div style={{ background: 'rgba(8,7,14,0.94)', border: '2px solid rgba(203,219,252,0.35)', padding: '14px 18px', maxWidth: 'min(92vw, 460px)', maxHeight: '86%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, opacity: 0.7, letterSpacing: 3 }}>{title}</div>
      {children}
      <button type="button" onClick={onClose} style={{ alignSelf: 'center', font: `15px ${FONT}`, color: INK, background: 'rgba(203,219,252,0.1)', border: '1px solid rgba(203,219,252,0.4)', borderRadius: 4, padding: '5px 20px', cursor: 'pointer' }}>
        {closeLabel}
      </button>
    </div>
  );
}

function PanelView({ panel, sound, onSound, onClose }: { panel: Panel; sound: SoundSettings; onSound: (s: SoundSettings) => void; onClose: () => void }) {
  if (panel === 'controls') {
    return (
      <Card title="조작" onClose={onClose}>
        <Controls />
      </Card>
    );
  }
  return (
    <Card title="소리" onClose={onClose}>
      <Slider label="배경음" value={sound.bgm} onChange={(bgm) => onSound({ ...sound, bgm })} />
      <Slider label="효과음" value={sound.sfx} onChange={(sfx) => onSound({ ...sound, sfx })} />
    </Card>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
      <span style={{ width: 52 }}>{label}</span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} style={{ width: 180, accentColor: EMBER }} />
      <span style={{ width: 32, textAlign: 'right', opacity: 0.7 }}>{Math.round(value * 100)}</span>
    </label>
  );
}

const KEYBOARD: readonly (readonly [string, string])[] = [
  ['WASD', '이동'],
  ['Space', '대시'],
  ['Shift', '패링'],
  ['마우스 왼쪽', '불꽃탄 (누르고 있으면 연사)'],
  ['마우스 오른쪽', '불기둥'],
  ['Esc', '일시정지'],
];
const TOUCH: readonly (readonly [string, string])[] = [
  ['왼쪽 아무 곳', '끌어서 이동'],
  ['패링 · 대시', '오른쪽 아래 버튼'],
  ['탄', '누르고 있으면 연사, 끌면 그 방향'],
  ['기둥', '끌어서 겨누고 떼면 발동'],
];

function Controls() {
  const rows = (title: string, list: readonly (readonly [string, string])[]) => (
    <div>
      <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 4 }}>{title}</div>
      {list.map(([key, what]) => (
        <div key={key} style={{ display: 'flex', gap: 12, fontSize: 14 }}>
          <span style={{ minWidth: 110, color: '#fff1c8' }}>{key}</span>
          <span>{what}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      {rows('키보드 · 마우스', KEYBOARD)}
      {rows('터치', TOUCH)}
    </>
  );
}
