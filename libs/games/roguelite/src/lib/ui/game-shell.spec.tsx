import { act, fireEvent, render, screen } from '@testing-library/react';
import { GameShell, type GameShellProps } from './game-shell.js';

const props = (over: Partial<GameShellProps> = {}): GameShellProps => ({
  screen: 'title',
  title: 't',
  version: 'v',
  canContinue: false,
  sound: { bgm: 1, sfx: 1 },
  controlsCard: false,
  onStart: vi.fn(),
  onContinue: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onRestart: vi.fn(),
  onSound: vi.fn(),
  onControlsCardClosed: vi.fn(),
  gameBox: { left: 0, top: 0, width: 480, height: 270 },
  ...over,
});

/** A finger on a button: down and up, no click (a touch device that never sends one, D-045). */
const tap = (el: Element) => {
  fireEvent.pointerDown(el, { pointerId: 3, pointerType: 'touch' });
  fireEvent.pointerUp(el, { pointerId: 3, pointerType: 'touch' });
};

describe('title / pause menus on touch (D-045)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const menu = () => act(() => void vi.advanceTimersByTime(3300));

  it('"시작" starts on the touch itself, with no click following', () => {
    const p = props();
    render(<GameShell {...p} />);
    menu();
    tap(screen.getByText('시작'));
    expect(p.onStart).toHaveBeenCalledTimes(1);
  });

  it('the click a browser may send after the touch does not start twice', () => {
    const p = props();
    render(<GameShell {...p} />);
    menu();
    const start = screen.getByText('시작');
    tap(start);
    fireEvent.click(start);
    expect(p.onStart).toHaveBeenCalledTimes(1);
  });

  it('a lift that did not start on the button does nothing (the tap that skips the fade-in)', () => {
    const p = props();
    render(<GameShell {...p} />);
    menu();
    fireEvent.pointerUp(screen.getByText('시작'), { pointerId: 3, pointerType: 'touch' });
    expect(p.onStart).not.toHaveBeenCalled();
  });

  it('the keyboard (Enter -> click) still works', () => {
    const p = props();
    render(<GameShell {...p} />);
    menu();
    fireEvent.click(screen.getByText('시작'));
    expect(p.onStart).toHaveBeenCalledTimes(1);
  });

  it('pause menu, sound panel and its close button all work by touch', () => {
    const p = props({ screen: 'paused' });
    render(<GameShell {...p} />);
    tap(screen.getByText('계속'));
    expect(p.onResume).toHaveBeenCalledTimes(1);
    tap(screen.getByText('소리'));
    expect(screen.getByText('배경음')).toBeTruthy();
    tap(screen.getByText('닫기'));
    expect(screen.getByText('처음부터')).toBeTruthy();
  });
});
