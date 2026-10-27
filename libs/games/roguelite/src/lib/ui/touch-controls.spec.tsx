import { createSnapshotStore, createVirtualControls } from '@g-game-farm/ribs';
import { act, fireEvent, render } from '@testing-library/react';
import { createTouchAimSource, EMPTY_TOUCH_VIEW } from '../combat/touch-feed.js';
import { TouchControls } from './touch-controls.js';

describe('touch controls switching on and off (D-045)', () => {
  beforeEach(() => {
    // jsdom has no matchMedia: a mouse-first device, so the controls start hidden.
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  });

  it('appear on the first touch and hide on a key, without breaking the game (React #310 unmounted everything)', () => {
    const view = createSnapshotStore({ ...EMPTY_TOUCH_VIEW, active: true, form: 'child' as const, maxEmbers: 3 });
    const { container } = render(<TouchControls virtual={createVirtualControls()} view={view} aim={createTouchAimSource()} quickRange={128} castRange={96} mode="auto" />);
    expect(container.childElementCount).toBe(0);
    act(() => void fireEvent.pointerDown(window, { pointerType: 'touch' }));
    expect(container.childElementCount).toBe(1);
    act(() => void fireEvent.keyDown(window, { code: 'KeyW' }));
    expect(container.childElementCount).toBe(0);
    act(() => void fireEvent.pointerDown(window, { pointerType: 'touch' }));
    expect(container.childElementCount).toBe(1);
  });
});
