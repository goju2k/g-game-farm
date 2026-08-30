import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
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
            // 엔진은 오픈소스 대상 — 게임/앱을 포함한 그 무엇에도 의존할 수 없다.
            {
              sourceTag: 'scope:engine',
              onlyDependOnLibsWithTags: ['scope:engine'],
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
            // { sourceTag: 'scope:game:<game>', onlyDependOnLibsWithTags: ['scope:ribs', 'scope:game:<game>'] }
            // roguelite-playground(및 나중에 생길 배포용 apps/*)도 같은 태그를 재사용(앱 전용 태그 패밀리를 따로 안 둠).
            {
              sourceTag: 'scope:game:roguelite',
              onlyDependOnLibsWithTags: ['scope:ribs', 'scope:game:roguelite'],
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
