import * as ribs from './index.js';

describe('ribs public barrel', () => {
  it('re-exports engine-react (and, transitively, engine)', () => {
    expect(typeof ribs.GameCanvas).toBe('function');
    expect(typeof ribs.createSnapshotStore).toBe('function');
    expect(typeof ribs.useSnapshotStore).toBe('function');
    expect(typeof ribs.useGameLoop).toBe('function');
    expect(typeof ribs.createEngine).toBe('function');
    expect(typeof ribs.createInputCapture).toBe('function');
    expect(typeof ribs.loadTextures).toBe('function');
    expect(typeof ribs.createWhitePixelTexture).toBe('function');
  });
});
