import { createSnapshotStore } from '@g-game-farm/ribs';
import { act, render, screen } from '@testing-library/react';
import { MonsterCountHud } from './monster-count-hud.js';

describe('MonsterCountHud', () => {
  it('renders the store\'s initial count', () => {
    const store = createSnapshotStore(4);
    render(<MonsterCountHud store={store} />);
    expect(screen.getByText('remaining monsters: 4')).toBeTruthy();
  });

  it('updates when the store publishes a new count', () => {
    const store = createSnapshotStore(4);
    render(<MonsterCountHud store={store} />);

    act(() => store.set(3));

    expect(screen.getByText('remaining monsters: 3')).toBeTruthy();
  });

  it('reaches 0 when every monster is gone', () => {
    const store = createSnapshotStore(1);
    render(<MonsterCountHud store={store} />);

    act(() => store.set(0));

    expect(screen.getByText('remaining monsters: 0')).toBeTruthy();
  });
});
