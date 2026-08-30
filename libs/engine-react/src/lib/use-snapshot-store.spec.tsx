import { act, render, screen } from '@testing-library/react';
import { createSnapshotStore } from './snapshot-store.js';
import { useSnapshotStore } from './use-snapshot-store.js';

function Probe({ store }: { store: ReturnType<typeof createSnapshotStore<number>> }) {
  const value = useSnapshotStore(store);
  return <div data-testid="value">{value}</div>;
}

describe('useSnapshotStore', () => {
  it('renders the store\'s current value on mount', () => {
    const store = createSnapshotStore(3);
    render(<Probe store={store} />);
    expect(screen.getByTestId('value').textContent).toBe('3');
  });

  it('re-renders when the store publishes a changed value', () => {
    const store = createSnapshotStore(0);
    render(<Probe store={store} />);

    act(() => store.set(7));

    expect(screen.getByTestId('value').textContent).toBe('7');
  });

  it('does not throw or misrender when set() is called with an unchanged value', () => {
    const store = createSnapshotStore(1);
    render(<Probe store={store} />);

    act(() => store.set(1));

    expect(screen.getByTestId('value').textContent).toBe('1');
  });
});
