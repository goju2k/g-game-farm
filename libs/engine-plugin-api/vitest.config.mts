import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/engine-plugin-api',
  test: {
    name: '@g-game-farm/engine-plugin-api',
    watch: false,
    globals: true,
    // Pure type declarations (PluginApi/System/SceneDefinition/...), no runtime logic to test.
    passWithNoTests: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
