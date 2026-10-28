import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import compression from 'compression';
import subsetFont from 'subset-font';
import { defineConfig, type Connect, type Plugin } from 'vite';

/** The build's label on screen (D-045): the commit for a built game ("+" if the working tree had changes), "dev" when served live. */
function buildLabel(command: 'build' | 'serve'): string {
  if (command === 'serve') return 'dev';
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    // Line endings alone (this checkout's autocrlf churn) don't count as a change.
    const dirty = execSync('git diff --ignore-cr-at-eol --name-only HEAD -- libs', { cwd: resolve(__dirname, '../../..') }).toString().trim() !== '';
    return `${commit}${dirty ? '+' : ''}`;
  } catch {
    return 'build';
  }
}

const GAME_DIR = resolve(__dirname, '../roguelite');

/** Every file under `dir` whose name passes `keep`. */
function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path, keep) : keep(name) ? [path] : [];
  });
}

/**
 * The built game's Galmuri11 holds only the characters the game can show
 * (D-049: 505KB -> a fraction): everything in the game's data (event
 * scripts, records, hints...) and its source (UI strings), plus printable
 * ASCII. Runs on every build, so new lines are picked up by themselves; the
 * dev server serves the full font. (OFL, no reserved font name: a subset
 * may keep the name.)
 */
function galmuriSubset(): Plugin {
  let outDir = '';
  return {
    name: 'galmuri-subset',
    apply: 'build',
    configResolved: (config) => void (outDir = resolve(config.root, config.build.outDir)),
    closeBundle: async () => {
      const sources = [
        ...filesUnder(join(GAME_DIR, 'public/game/data'), (n) => n.endsWith('.json')),
        ...filesUnder(join(GAME_DIR, 'src'), (n) => /\.(ts|tsx)$/.test(n) && !/\.spec\./.test(n)),
      ];
      const chars = new Set<string>();
      for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
      for (const file of sources) for (const ch of readFileSync(file, 'utf8')) if (ch.charCodeAt(0) >= 0x80) chars.add(ch);
      const fontPath = join(outDir, 'game/fonts/Galmuri11.woff2');
      const full = readFileSync(fontPath);
      const subset = await subsetFont(full, [...chars].join(''), { targetFormat: 'woff2' });
      writeFileSync(fontPath, subset);
      console.log(`galmuri-subset: ${chars.size} characters, ${Math.round(full.length / 1024)}KB -> ${Math.round(subset.length / 1024)}KB`);
    },
  };
}

/**
 * Where the built game is shared from (D-050) — og:url / og:image must be
 * absolute for messenger crawlers. Set SHARE_BASE_URL when building for a
 * different address (e.g. the friends' link); ends with "/".
 */
const SHARE_BASE_URL = (process.env['SHARE_BASE_URL'] ?? 'http://home.ribs.kr:3105/').replace(/\/?$/, '/');
const SHARE = {
  title: '센티넬',
  description: '봉인된 탑 깊은 곳, 작은 푸른 불씨가 깨어났다. 패링과 캐스팅, 콤보로 길을 여는 픽셀 액션 던전.',
  imageAlt: '어두운 던전, 봉인 수정의 차가운 빛 속에 떠 있는 푸른 불씨',
  /** Bumped with each new og-image.png: messengers cache by URL, so a new picture needs a new address. */
  imageVersion: 2,
} as const;

/** HTML-escapes an attribute value. */
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The page's head (D-050): the built game gets its share preview (Open
 * Graph, Twitter card, description, theme colour, icons — the images are
 * the asset room's, at the site root); the dev server is just
 * "센티넬 · dev".
 */
function sharePreview(): Plugin {
  let command: 'build' | 'serve' = 'serve';
  return {
    name: 'share-preview',
    configResolved: (config) => void (command = config.command),
    transformIndexHtml: (html) => {
      if (command === 'serve') return html.replace(/<title>[^<]*<\/title>/, `<title>${SHARE.title} · dev</title>`);
      const url = SHARE_BASE_URL;
      const image = `${url}og-image.png?v=${SHARE.imageVersion}`;
      const meta = [
        `<meta name="description" content="${attr(SHARE.description)}" />`,
        `<meta name="theme-color" content="#0b0910" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${attr(SHARE.title)}" />`,
        `<meta property="og:title" content="${attr(SHARE.title)}" />`,
        `<meta property="og:description" content="${attr(SHARE.description)}" />`,
        `<meta property="og:locale" content="ko_KR" />`,
        `<meta property="og:url" content="${attr(url)}" />`,
        `<meta property="og:image" content="${attr(image)}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="${attr(SHARE.imageAlt)}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${attr(SHARE.title)}" />`,
        `<meta name="twitter:description" content="${attr(SHARE.description)}" />`,
        `<meta name="twitter:image" content="${attr(image)}" />`,
        `<meta name="twitter:image:alt" content="${attr(SHARE.imageAlt)}" />`,
        `<link rel="icon" href="/favicon.ico" sizes="any" />`,
        `<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />`,
        `<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />`,
        `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`,
      ];
      return html.replace('</head>', `    ${meta.join('\n    ')}\n  </head>`);
    },
  };
}

/**
 * Caching for the built game (D-049): hashed bundles (/assets/*) never
 * change under their name — cached for a year; everything else (index.html,
 * the game's unhashed /game/* files) is revalidated each visit (no-cache +
 * ETag: a 304 when unchanged), so an update always shows. Text (JS, JSON)
 * goes gzipped.
 */
function previewCaching(): Plugin {
  return {
    name: 'preview-caching',
    configurePreviewServer: (server) => {
      server.middlewares.use(compression() as unknown as Connect.NextHandleFunction);
      server.middlewares.use((req, res, next) => {
        res.setHeader('Cache-Control', req.url?.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  define: { __BUILD_LABEL__: JSON.stringify(buildLabel(command)) },
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/games/roguelite-playground',
  plugins: [react(), galmuriSubset(), previewCaching(), sharePreview()],
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
