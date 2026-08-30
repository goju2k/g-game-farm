import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/games/roguelite',
  plugins: [react()],
  resolve: {
    // Workspace packages (ribs -> engine-react) get consumed via their
    // built dist/ output here (no "g-game-farm" custom condition
    // requested), which can otherwise resolve a second copy of react
    // separate from the one @testing-library/react uses directly —
    // classic monorepo "Invalid hook call" cause. Force a single instance.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    name: 'roguelite',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
