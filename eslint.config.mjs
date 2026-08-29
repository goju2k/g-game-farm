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
            // 게임 라이브러리를 추가할 때 game 하나마다 여기에 constraint를 추가할 것:
            // { sourceTag: 'scope:game:<game>', onlyDependOnLibsWithTags: ['scope:engine', 'scope:game:<game>'] }
            // apps/web-roguelite도 같은 태그를 재사용(앱 전용 태그 패밀리를 따로 안 둠).
            {
              sourceTag: 'scope:game:roguelite',
              onlyDependOnLibsWithTags: ['scope:engine', 'scope:game:roguelite'],
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
