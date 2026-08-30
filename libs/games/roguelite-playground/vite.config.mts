import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/games/roguelite-playground',
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig.base.json's customConditions: ["g-game-farm"] — each
    // workspace package's "exports" map lists "g-game-farm" before
    // "import"/"default", so requesting this condition resolves straight
    // to src/index.ts instead of dist/ (same as tsc/vitest already do).
    // Without this, engine/engine-react/ribs/roguelite would all need to
    // be built first for `vite dev` to see anything — with it, editing
    // any of their source hot-reloads directly.
    conditions: ['g-game-farm'],
    dedupe: ['react', 'react-dom'],
  },
  // Canonical asset source lives in the roguelite library itself, not
  // here — Vite's publicDir can point outside the project root, so no
  // asset duplication or copy step is needed for local dev.
  publicDir: resolve(__dirname, '../roguelite/public'),
  server: { port: 4300 },
});
