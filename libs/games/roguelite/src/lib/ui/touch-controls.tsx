'use client';
import { useSnapshotStore, type SnapshotStore, type VirtualControls } from '@g-game-farm/ribs';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { VIRTUAL } from '../combat/intent.js';
import { autoAim, TOUCH_RING_STEPS, type TouchAimSource, type TouchView } from '../combat/touch-feed.js';

/**
 * Mobile touch controls (touch spec v1): a floating move stick on the left
 * half, a right-thumb arc of buttons. They only write to VirtualControls —
 * the game reads the same intents as from a keyboard (spec §0).
 *
 * Fills its parent: the whole screen in landscape, the control area under
 * the game in portrait (spec §7, D-026). Any orientation works — nothing is
 * paused or locked (D-027).
 */

export type TouchMode = 'auto' | 'on' | 'off';

export interface TouchControlsProps {
  readonly virtual: VirtualControls;
  readonly view: SnapshotStore<TouchView>;
  readonly aim: TouchAimSource;
  /** Spell ranges in world px: quick-spell auto-aim range, cast-spell max aim distance. */
  readonly quickRange: number;
  readonly castRange: number;
  /** ?touch=1/0 forces it; 'auto' follows the last input device (spec §5). */
  readonly mode: TouchMode;
}

const STICK_OUTER = 112;
const STICK_KNOB = 48;
const DEADZONE = 0.15;
/** Drag this far (CSS px) from a spell button before it counts as manual aiming. */
const DRAG_START_PX = 14;
/** A full-strength cast drag: this many CSS px maps to the cast's max range. */
const CAST_DRAG_FULL_PX = 90;
/** Without a target, the cast goes this far ahead (touch spec §2). */
const CAST_FALLBACK_PX = 48;

type ButtonId = 'parry' | 'dash' | 'quickSpell' | 'castSpell';

/** Position from the bottom-right corner (inside the safe area) and size, CSS px — the thumb arc of spec §1. */
const BUTTONS: Readonly<Record<ButtonId, { right: number; bottom: number; size: number; label: string }>> = {
  parry: { right: 24, bottom: 24, size: 76, label: '패링' },
  dash: { right: 116, bottom: 20, size: 64, label: '대시' },
  quickSpell: { right: 108, bottom: 104, size: 56, label: '탄' },
  castSpell: { right: 52, bottom: 168, size: 56, label: '기둥' },
};

/** 8-way quantized stick direction (spec §2), or 0,0 inside the dead zone. */
export function quantizeStick(dx: number, dy: number, radius: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length < radius * DEADZONE) return { x: 0, y: 0 };
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const angle = octant * (Math.PI / 4);
  return { x: Math.round(Math.cos(angle)), y: Math.round(Math.sin(angle)) };
}

function useTouchActive(mode: TouchMode): boolean {
  // Auto starts on for touch-first devices (a phone), off for mouse ones, then follows the last input.
  const [active, setActive] = useState(() => mode === 'on' || (mode === 'auto' && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches));
  useEffect(() => {
    if (mode !== 'auto') {
      setActive(mode === 'on');
      return;
    }
    const onPointer = (e: PointerEvent) => setActive(e.pointerType === 'touch');
    const onKey = () => setActive(false);
    window.addEventListener('pointerdown', onPointer, { capture: true });
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [mode]);
  return active;
}

export function TouchControls({ virtual, view: viewStore, aim, quickRange, castRange, mode }: TouchControlsProps) {
  const view = useSnapshotStore(viewStore);
  const active = useTouchActive(mode) && view.active && !view.locked;
  const [stick, setStick] = useState<{ id: number; x: number; y: number; kx: number; ky: number } | undefined>(undefined);
  const [pressed, setPressed] = useState<ReadonlySet<ButtonId>>(new Set());
  const spellDrag = useRef(new Map<number, { button: ButtonId; cx: number; cy: number; dragging: boolean; manual?: { x: number; y: number }; dir?: { x: number; y: number } }>());
  /** While the quick-spell button is held: re-aim every frame (D-025 — auto: nearest enemy each shot; dragged: that direction from where the player is now). */
  const quickAimLoop = useRef<number | undefined>(undefined);
  const stopQuickAim = () => {
    if (quickAimLoop.current !== undefined) cancelAnimationFrame(quickAimLoop.current);
    quickAimLoop.current = undefined;
  };
  useEffect(() => stopQuickAim, []);
  const lastParries = useRef(view.parrySuccesses);

  // The game reads "touch" to apply inputOverrides.touch; hiding the controls releases everything.
  useEffect(() => {
    virtual.setAxis(VIRTUAL.touch, active ? 1 : 0);
    if (!active) {
      virtual.reset();
      setStick(undefined);
      setPressed(new Set());
    }
  }, [active, virtual]);

  // Haptic tick on a successful parry (spec §3) — where supported.
  useEffect(() => {
    if (active && view.parrySuccesses > lastParries.current) navigator.vibrate?.(20);
    lastParries.current = view.parrySuccesses;
  }, [active, view.parrySuccesses]);

  if (!active) return null;

  const spells = view.maxEmbers > 0;
  const minimal = view.form === 'ember'; // Act 1: outline only, barely there (spec §1)

  const setPressedFor = (id: ButtonId, down: boolean) =>
    setPressed((prev) => {
      const next = new Set(prev);
      if (down) next.add(id);
      else next.delete(id);
      return next;
    });

  // --- move stick (left half) ---
  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stick) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStick({ id: e.pointerId, x: e.clientX, y: e.clientY, kx: 0, ky: 0 });
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stick || e.pointerId !== stick.id) return;
    const r = STICK_OUTER / 2;
    let dx = e.clientX - stick.x;
    let dy = e.clientY - stick.y;
    const dir = quantizeStick(dx, dy, r);
    virtual.setAxis(VIRTUAL.moveX, dir.x);
    virtual.setAxis(VIRTUAL.moveY, dir.y);
    const length = Math.hypot(dx, dy);
    if (length > r) {
      dx = (dx / length) * r;
      dy = (dy / length) * r;
    }
    setStick({ ...stick, kx: dx, ky: dy });
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stick || e.pointerId !== stick.id) return;
    virtual.setAxis(VIRTUAL.moveX, 0);
    virtual.setAxis(VIRTUAL.moveY, 0);
    setStick(undefined);
  };

  // --- buttons ---
  const onButtonDown = (id: ButtonId) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressedFor(id, true);
    if (id === 'parry' || id === 'dash') {
      virtual.press(id === 'parry' ? VIRTUAL.parry : VIRTUAL.dash); // the touch itself is the input (spec §2)
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const drag = { button: id, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, dragging: false } as { button: ButtonId; cx: number; cy: number; dragging: boolean; manual?: { x: number; y: number }; dir?: { x: number; y: number } };
    spellDrag.current.set(e.pointerId, drag);
    if (id === 'quickSpell') {
      // Held = auto-fire (the game re-fires every interval); keep the aim fresh until release.
      const aimNow = () => {
        const target = drag.dir && aim.player ? { x: aim.player.x + drag.dir.x * quickRange, y: aim.player.y + drag.dir.y * quickRange } : autoAim(aim, quickRange, quickRange);
        if (target) virtual.setAim(target);
        if (drag.dir && target) aim.preview = { kind: 'quick', x: target.x, y: target.y };
        quickAimLoop.current = requestAnimationFrame(aimNow);
      };
      stopQuickAim();
      aimNow();
      virtual.press(VIRTUAL.quickSpell);
    }
  };
  const onButtonMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = spellDrag.current.get(e.pointerId);
    if (!drag || !aim.player) return;
    const dx = e.clientX - drag.cx;
    const dy = e.clientY - drag.cy;
    const distance = Math.hypot(dx, dy);
    if (!drag.dragging && distance < DRAG_START_PX) return;
    drag.dragging = true;
    const ux = dx / (distance || 1);
    const uy = dy / (distance || 1);
    drag.dir = { x: ux, y: uy };
    const reach = drag.button === 'quickSpell' ? quickRange : Math.min(1, distance / CAST_DRAG_FULL_PX) * castRange;
    drag.manual = { x: aim.player.x + ux * reach, y: aim.player.y + uy * reach };
    aim.preview = { kind: drag.button === 'quickSpell' ? 'quick' : 'cast', x: drag.manual.x, y: drag.manual.y };
  };
  const onButtonUp = (id: ButtonId) => (e: ReactPointerEvent<HTMLDivElement>) => {
    setPressedFor(id, false);
    if (id === 'parry' || id === 'dash') {
      virtual.release(id === 'parry' ? VIRTUAL.parry : VIRTUAL.dash);
      return;
    }
    const drag = spellDrag.current.get(e.pointerId);
    spellDrag.current.delete(e.pointerId);
    aim.preview = undefined;
    if (id === 'quickSpell') {
      stopQuickAim();
      virtual.release(VIRTUAL.quickSpell); // lifting stops the auto-fire
      return;
    }
    if (!drag) return;
    const backOnButton = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < BUTTONS[id].size / 2;
    if (drag.dragging && backOnButton) return; // dragged back onto the button: cancel (spec §2)
    const target = drag.dragging && drag.manual ? drag.manual : autoAim(aim, castRange, CAST_FALLBACK_PX);
    if (!target) return;
    // Cast spell: release = start casting, aim fixed now (touch spec §2, combat spec §5).
    virtual.setAim(target);
    virtual.press(VIRTUAL.castSpell);
    virtual.release(VIRTUAL.castSpell);
  };

  const visible: ButtonId[] = spells ? ['parry', 'dash', 'quickSpell', 'castSpell'] : ['parry', 'dash'];
  const ringOf = (id: ButtonId) => (id === 'dash' ? view.dashRing : id === 'quickSpell' ? view.quickRing : id === 'castSpell' ? view.castRing : 0);

  const layer: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', touchAction: 'none', userSelect: 'none', font: '13px/1 sans-serif' };
  return (
    <div style={layer}>
      {/* Swallows touches between controls — and on the game box above, in portrait — so they never reach the canvas as emulated mouse clicks (= the mouse spell). */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'auto', touchAction: 'none' }} />
      {/* Left half: the stick appears wherever the thumb lands. */}
      <div
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', pointerEvents: 'auto', touchAction: 'none' }}
      >
        {stick && (
          <>
            <div
              style={{
                position: 'fixed',
                left: stick.x - STICK_OUTER / 2,
                top: stick.y - STICK_OUTER / 2,
                width: STICK_OUTER,
                height: STICK_OUTER,
                borderRadius: '50%',
                border: '2px solid rgba(203,219,252,0.5)',
                background: 'rgba(203,219,252,0.06)',
              }}
            />
            <div
              style={{
                position: 'fixed',
                left: stick.x + stick.kx - STICK_KNOB / 2,
                top: stick.y + stick.ky - STICK_KNOB / 2,
                width: STICK_KNOB,
                height: STICK_KNOB,
                borderRadius: '50%',
                background: 'rgba(203,219,252,0.45)',
              }}
            />
          </>
        )}
      </div>

      {visible.map((id) => {
        const spec = BUTTONS[id];
        const down = pressed.has(id);
        const ring = ringOf(id);
        const size = spec.size;
        const r = size / 2 + 3;
        const circumference = 2 * Math.PI * r;
        return (
          <div
            key={id}
            onPointerDown={onButtonDown(id)}
            onPointerMove={onButtonMove}
            onPointerUp={onButtonUp(id)}
            onPointerCancel={onButtonUp(id)}
            style={{
              position: 'absolute',
              right: `calc(env(safe-area-inset-right, 0px) + ${spec.right}px)`,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${spec.bottom}px)`,
              width: size,
              height: size,
              borderRadius: '50%',
              border: `2px solid rgba(203,219,252,${down ? 0.95 : 0.7})`,
              background: minimal && !down ? 'transparent' : `rgba(203,219,252,${down ? 0.4 : 0.12})`,
              color: '#cbdbfc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: minimal && !down ? 0.35 : 1,
              transform: down ? 'scale(0.9)' : 'none',
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
          >
            {!minimal && spec.label}
            {ring > 0 && (
              <svg width={size + 10} height={size + 10} style={{ position: 'absolute', left: -7, top: -7, pointerEvents: 'none' }}>
                <circle
                  cx={size / 2 + 5}
                  cy={size / 2 + 5}
                  r={r}
                  fill="none"
                  stroke="rgba(203,219,252,0.8)"
                  strokeWidth={3}
                  strokeDasharray={`${(circumference * ring) / TOUCH_RING_STEPS} ${circumference}`}
                  transform={`rotate(-90 ${size / 2 + 5} ${size / 2 + 5})`}
                />
              </svg>
            )}
          </div>
        );
      })}

      {spells && (
        <div
          style={{
            position: 'absolute',
            right: `calc(env(safe-area-inset-right, 0px) + ${BUTTONS.castSpell.right + BUTTONS.castSpell.size + 10}px)`,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + ${BUTTONS.castSpell.bottom + BUTTONS.castSpell.size / 2 - 6}px)`,
            display: 'flex',
            gap: 4,
          }}
        >
          {Array.from({ length: view.maxEmbers }, (_, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: i < view.embers ? '#df7126' : 'transparent', border: '1px solid #df7126' }} />
          ))}
        </div>
      )}

      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          const root = document.documentElement;
          if (document.fullscreenElement) void document.exitFullscreen();
          else void root.requestFullscreen?.().catch(() => undefined); // no orientation lock: either way round works (D-026)
        }}
        style={{
          position: 'absolute',
          left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
          top: 'calc(env(safe-area-inset-top, 0px) + 24px)',
          width: 40,
          height: 40,
          borderRadius: 8,
          border: '1px solid rgba(203,219,252,0.4)',
          color: '#cbdbfc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          fontSize: 20,
        }}
      >
        ⛶
      </div>

    </div>
  );
}
