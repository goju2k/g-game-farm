import { screenLayout } from './screen-layout.js';

describe('screenLayout (D-046: the game fills the screen)', () => {
  it('sideways: the whole screen, no margins', () => {
    expect(screenLayout(1280, 720)).toEqual({ kind: 'landscape', game: { left: 0, top: 0, width: 1280, height: 720 } });
  });
  it('upright: the whole screen too — no control area under a box', () => {
    expect(screenLayout(390, 844)).toEqual({ kind: 'portrait', game: { left: 0, top: 0, width: 390, height: 844 } });
  });
});
