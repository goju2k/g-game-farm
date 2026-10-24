import type { Rgb } from '@g-game-farm/ribs';
import type { RoomLighting } from '../components.js';

/**
 * Act 1 (Part 0) dungeon light, as art-directed by ribs-assets (the same
 * values its map viewer and Part 0 cuts use): near-dark with a faint violet
 * cast, stepped 3/4-view light pools, warm fire vs cold seal light, and the
 * glowing palette colors left at full brightness.
 */

/** Per-channel L·(1 + k·L) strengths — see LightDraw.tint. */
export const WARM_LIGHT: Rgb = [0.35, 0.12, -0.25];
export const COLD_LIGHT: Rgb = [-0.2, 0.15, 0.35];

export const DUNGEON_LIGHTING: RoomLighting = {
  settings: {
    ambient: [0.3, 0.3, 0.33],
    bands: [
      { until: 0.4, intensity: 1 },
      { until: 0.7, intensity: 0.75 },
      { until: 1, intensity: 0.55 },
    ],
    // Flame #ac3232 #df7126 #fbf236, seal crystal #5fcde4 #cbdbfc.
    emissive: [
      [0xac, 0x32, 0x32],
      [0xdf, 0x71, 0x26],
      [0xfb, 0xf2, 0x36],
      [0x5f, 0xcd, 0xe4],
      [0xcb, 0xdb, 0xfc],
    ],
  },
  squashY: 0.75,
};

/** The child mage's hand flame, relative to its anchor when facing right. */
export const MAGE_HAND_FLAME = { offsetX: 8, offsetY: -9, radius: 55, tint: WARM_LIGHT } as const;
