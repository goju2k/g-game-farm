//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js options go here
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js

  // Off because dev-mode's double-invoke (mount->cleanup->mount) would
  // create two WebGL contexts/programs back to back — EngineRenderer has
  // no dispose() yet, so the first one just leaks instead of being cleaned
  // up. Harmless at this scale, but not worth the double-init noise while
  // iterating. Revisit once the engine grows a dispose() (see texture-heavy
  // work later) — re-enabling StrictMode then is a one-line flip.
  reactStrictMode: false,

  // Workspace packages are resolved via their package.json "exports" dist
  // fields (Next doesn't understand the "g-game-farm" custom condition our
  // libs use for direct-source resolution in tsc/vitest) — this tells Next
  // to actually transpile/watch them instead of treating them as opaque
  // pre-built node_modules.
  transpilePackages: ['@g-game-farm/engine', '@g-game-farm/roguelite'],
};

module.exports = nextConfig;
