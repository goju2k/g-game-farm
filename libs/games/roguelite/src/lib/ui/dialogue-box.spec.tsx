import { createSnapshotStore } from '@g-game-farm/ribs';
import { act, render, screen } from '@testing-library/react';
import { EMPTY_DIALOGUE_STATE, type DialogueState } from '../scenario/dialogue-state.js';
import { DialogueBox } from './dialogue-box.js';

describe('DialogueBox', () => {
  it('renders nothing while the store is empty', () => {
    const store = createSnapshotStore<DialogueState>(EMPTY_DIALOGUE_STATE);
    const { container } = render(<DialogueBox store={store} />);
    expect(container.textContent).toBe('');
  });

  it('shows the line and the continue hint once the store publishes one', () => {
    const store = createSnapshotStore<DialogueState>(EMPTY_DIALOGUE_STATE);
    render(<DialogueBox store={store} />);

    act(() => store.set({ visible: true, text: 'an ancient seal cracks further.' }));

    expect(screen.getByText('an ancient seal cracks further.')).toBeTruthy();
    expect(screen.getByText('[E] continue')).toBeTruthy();
  });

  it('goes back to rendering nothing once dismissed', () => {
    const store = createSnapshotStore<DialogueState>({ visible: true, text: 'hello' });
    const { container } = render(<DialogueBox store={store} />);

    act(() => store.set(EMPTY_DIALOGUE_STATE));

    expect(container.textContent).toBe('');
  });
});
