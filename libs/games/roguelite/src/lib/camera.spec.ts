import { createCollisionGrid, World, type TextureHandle } from '@g-game-farm/ribs';
import { cameraCenterFor, cameraZoomFor, viewSizeFor } from './camera.js';
import { PlayerControlled, Position, RoomTileLayout, SpriteRender } from './components.js';
import { CameraDirector } from './events/event-components.js';

/** A room `columns` x `rows` tiles (16px) with the player's sprite centred at (cx, cy). */
function scene(columns: number, rows: number, cx: number, cy: number, director?: CameraDirector) {
  const world = new World();
  world.set(world.createEntity(), RoomTileLayout, { sprites: [], collision: createCollisionGrid({ originX: 0, originY: 0, cellSize: 16, columns, rows, cells: new Array<number>(columns * rows).fill(0) }) });
  const player = world.createEntity();
  world.set(player, Position, { x: cx - 8, y: cy - 8 });
  world.set(player, SpriteRender, { texture: 0 as TextureHandle, layer: 'gameplay', sx: 0, sy: 0, sWidth: 16, sHeight: 16, width: 16, height: 16 });
  world.set(player, PlayerControlled, {} as never);
  if (director) world.set(world.createEntity(), CameraDirector, director);
  return world;
}

describe('camera (D-046/D-048: fill the screen; the short axis sees at least 270 sideways, 200 upright)', () => {
  it('sideways: the largest integer scale that still shows 270 world px across the short side', () => {
    expect(cameraZoomFor({ width: 1920, height: 1080 })).toBe(4);
    expect(viewSizeFor({ width: 1920, height: 1080 })).toEqual({ width: 480, height: 270 });
    // A PC window that isn't 16:9: wider than 480.
    expect(viewSizeFor({ width: 1600, height: 900 })).toEqual({ width: 1600 / 3, height: 300 });
  });

  it('upright: closer — at least 200 across (D-048), with slack for a few px of rounding', () => {
    expect(viewSizeFor({ width: 1080, height: 2340 })).toEqual({ width: 216, height: 468 }); // 5x
    expect(cameraZoomFor({ width: 1440, height: 3120 })).toBe(7);
    expect(cameraZoomFor({ width: 1076, height: 2300 })).toBe(5); // 4 px short of 5x200 still counts
  });

  it('a big room: follows the player, but stops at the room edges', () => {
    const big = { width: 1920, height: 1080 }; // 480 x 270 view
    expect(cameraCenterFor(scene(100, 60, 800, 500), big)).toMatchObject({ x: 800, y: 500 });
    expect(cameraCenterFor(scene(100, 60, 30, 20), big)).toMatchObject({ x: 240, y: 135 }); // the top-left corner
    expect(cameraCenterFor(scene(100, 60, 1590, 950), big)).toMatchObject({ x: 1600 - 240, y: 960 - 135 });
  });

  it('a room smaller than the view sits in the middle (the rest is letterbox)', () => {
    expect(cameraCenterFor(scene(20, 10, 40, 40), { width: 1920, height: 1080 })).toMatchObject({ x: 160, y: 80 });
  });

  it('upright, the player stands at about 40% of the height (clear of the thumbs)', () => {
    const phone = { width: 1080, height: 2340 }; // 216 x 468 view
    const c = cameraCenterFor(scene(100, 100, 800, 800), phone);
    expect(c?.y).toBeCloseTo(800 + 468 * 0.1, 5);
    // A scripted pan (fixed) shows exactly its point.
    const pan = cameraCenterFor(scene(100, 100, 800, 800, { mode: 'fixed', target: '', x: 500, y: 600 }), phone);
    expect(pan).toMatchObject({ x: 500, y: 600 });
  });
});
