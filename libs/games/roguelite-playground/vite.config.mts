import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** The build's label on screen (D-045): the commit for a built game ("+" if the working tree had changes), "dev" when served live. */
function buildLabel(command: 'build' | 'serve'): string {
  if (command === 'serve') return 'dev';
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    const dirty = execSync('git status --porcelain -- .. ../../engine* ../../ribs', { cwd: __dirname }).toString().trim() !== '';
    return `${commit}${dirty ? '+' : ''}`;
  } catch {
    return 'build';
  }
}

export default defineConfig(({ command }) => ({
  define: { __BUILD_LABEL__: JSON.stringify(buildLabel(command)) },
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
  server: {
    port: 4300,
    // Remote preview: `npm run remote:roguelite` binds 127.0.0.1:3204, and a
    // docker TCP relay (dev-proxy-3104) exposes it as home.ribs.kr:3104.
    // Vite rejects unknown Host headers, so the public name must be listed.
    allowedHosts: ['home.ribs.kr'],
  },
  // `npm run share:roguelite`: the built game on 127.0.0.1:3205, relayed as home.ribs.kr:3105 (D-045) — a
  // few bundled files instead of hundreds of dev modules, so a phone loads in seconds. The dev server stays on 3204/3104.
  preview: {
    allowedHosts: ['home.ribs.kr'],
  },
}));
