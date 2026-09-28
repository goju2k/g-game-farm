import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    // maps/ holds map-editor source files (Tiled .tmj/.tmx/.tsj/.tsx among them) — not code.
    // Tiled's own external-tileset extension (.tsx) collides with React's; excluding the whole
    // directory (rather than just that one extension) keeps this robust to whatever a given map
    // editor's format happens to be named, for any current or future game's maps/ folder.
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*', '**/maps/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // engine 서브도메인 계층 — 의존 방향은 libs/engine 분리 당시 실측한 그래프 그대로.
            // Layer 0(순수 foundation, 서로 의존 없음):
            {
              sourceTag: 'scope:engine-ecs',
              onlyDependOnLibsWithTags: ['scope:engine-ecs'],
            },
            {
              sourceTag: 'scope:engine-math',
              onlyDependOnLibsWithTags: ['scope:engine-math'],
            },
            {
              sourceTag: 'scope:engine-platform',
              onlyDependOnLibsWithTags: ['scope:engine-platform'],
            },
            {
              sourceTag: 'scope:engine-input',
              onlyDependOnLibsWithTags: ['scope:engine-input'],
            },
            {
              sourceTag: 'scope:engine-scenario',
              onlyDependOnLibsWithTags: ['scope:engine-scenario'],
            },
            {
              sourceTag: 'scope:engine-events',
              onlyDependOnLibsWithTags: ['scope:engine-events'],
            },
            // 런타임 레이어 그래프와 무관한 별도 축 — 저작 시점(빌드타임) 데이터 계약.
            // World/Engine/System 어디에도 안 얽히는 순수 타입뿐이라 의존 0.
            {
              sourceTag: 'scope:engine-tilemap',
              onlyDependOnLibsWithTags: ['scope:engine-tilemap'],
            },
            // Layer 1(Layer 0에만 의존):
            {
              sourceTag: 'scope:engine-render',
              onlyDependOnLibsWithTags: ['scope:engine-render', 'scope:engine-math'],
            },
            {
              sourceTag: 'scope:engine-physics',
              onlyDependOnLibsWithTags: ['scope:engine-physics', 'scope:engine-ecs', 'scope:engine-events'],
            },
            {
              sourceTag: 'scope:engine-animation',
              onlyDependOnLibsWithTags: [
                'scope:engine-animation',
                'scope:engine-ecs',
                'scope:engine-render',
                'scope:engine-events',
              ],
            },
            // Layer 2(계약/조립):
            {
              sourceTag: 'scope:engine-plugin-api',
              onlyDependOnLibsWithTags: [
                'scope:engine-plugin-api',
                'scope:engine-ecs',
                'scope:engine-input',
                'scope:engine-render',
                'scope:engine-events',
              ],
            },
            {
              sourceTag: 'scope:engine-runtime',
              onlyDependOnLibsWithTags: [
                'scope:engine-runtime',
                'scope:engine-ecs',
                'scope:engine-input',
                'scope:engine-platform',
                'scope:engine-plugin-api',
                'scope:engine-render',
                'scope:engine-events',
              ],
            },
            // 엔진은 오픈소스 대상 — 게임/앱을 포함한 그 무엇에도 의존할 수 없다. 우산 패키지라 서브도메인 전부에 의존 가능.
            {
              sourceTag: 'scope:engine',
              onlyDependOnLibsWithTags: [
                'scope:engine',
                'scope:engine-ecs',
                'scope:engine-math',
                'scope:engine-platform',
                'scope:engine-input',
                'scope:engine-scenario',
                'scope:engine-events',
                'scope:engine-render',
                'scope:engine-physics',
                'scope:engine-animation',
                'scope:engine-plugin-api',
                'scope:engine-runtime',
              ],
            },
            // engine-react는 engine 위에 얹히는 React 통합 계층 — engine과 자기 자신만 의존 가능.
            {
              sourceTag: 'scope:engine-react',
              onlyDependOnLibsWithTags: ['scope:engine', 'scope:engine-react'],
            },
            // ribs는 engine-react 위의 우산 패키지 — engine을 건너뛰어 직접 의존할 수 없다(레이어 스킵 금지).
            {
              sourceTag: 'scope:ribs',
              onlyDependOnLibsWithTags: ['scope:engine-react', 'scope:ribs'],
            },
            // 게임 라이브러리를 추가할 때 game 하나마다 여기에 constraint를 추가할 것:
            // { sourceTag: 'scope:game:<game>', onlyDependOnLibsWithTags: ['scope:ribs', 'scope:engine-tilemap', 'scope:game:<game>'] }
            // roguelite-playground(및 나중에 생길 배포용 apps/*)도 같은 태그를 재사용(앱 전용 태그 패밀리를 따로 안 둠).
            //
            // scope:engine-tilemap은 예외로 ribs를 안 거치고 직접 의존 허용 — "게임은 ribs만
            // 본다"는 규칙은 런타임 API 우회를 막으려는 것인데, engine-tilemap은 런타임 엔진과
            // 무관한 빌드타임 저작 데이터 계약(TileMap IR/TileMapBuilder)이라 같은 이유로
            // 막을 필요가 없다 — 각 게임이 자기 맵에디터 컨버터(예: Tiled)를 직접 구현하는 곳.
            {
              sourceTag: 'scope:game:roguelite',
              onlyDependOnLibsWithTags: ['scope:ribs', 'scope:engine-tilemap', 'scope:game:roguelite'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      // 인터페이스 구현상 자리는 필요하지만 실제로 안 쓰는 파라미터(예: NullRenderer)는 `_` 접두사로 표시.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
];
