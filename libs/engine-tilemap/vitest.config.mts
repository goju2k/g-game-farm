import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/engine-tilemap',
  test: {
    name: '@g-game-farm/engine-tilemap',
    watch: false,
    globals: true,
    environment: 'node',
    // Pure type declarations (TileMap/TileMapBuilder), no runtime logic to test.
    passWithNoTests: true,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
