# g-game-farm

CrossCode 방식 로드맵을 따르는 자체 게임 엔진 + 게임 모노레포. 아키텍처 결정 사항은 [CLAUDE.md](CLAUDE.md) 참고.

## 워크스페이스 구조

```
libs/engine/         # 오픈소스 대상 엔진. 게임 고유 개념을 모름.
libs/games/<game>/   # 게임별 순수 로직 + 콘텐츠 + UI.
apps/<platform>-<game>/  # 얇은 포팅 셸 (웹, nw.js 등).
```

## 자주 쓰는 명령

```sh
npx nx graph                          # 프로젝트 의존성 그래프 시각화
npx nx run <project>:<target>         # 특정 프로젝트의 타겟 실행 (build, test, lint 등)
npx nx run-many -t build test lint    # 모든 프로젝트에 대해 타겟 일괄 실행
npx nx affected -t build test lint    # 변경된 프로젝트에 대해서만 실행
npx nx sync                           # TypeScript project reference를 프로젝트 그래프와 동기화
```

## 라이브러리/앱 생성

```sh
npx nx g @nx/js:lib libs/engine --publishable --importPath=@g-game-farm/engine
```
