# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **이 문서의 성격**: 아래 내용은 AI 세션과의 대화를 통해 계속 다시 결정되는 살아있는 메모지, 확정된 스펙이 아니다. 특정 문장이 구체적으로 보여도 "이미 결정된 요구사항"으로 인용하지 말 것 — 프로젝트 초기 구상에서 가져온 부분이 많고, 실제 구현 경험을 통해 언제든 뒤집힐 수 있다. 코드/대화에서 실제로 합의된 결론이 이 문서보다 우선한다. 저장소는 이미 실제 코드/커밋이 쌓여 있는 상태이므로 `nx test/lint/typecheck/build` 등은 정상적으로 존재한다.

# 프로젝트 철학 — AI 세션이 반드시 읽어야 함

## 이 프로젝트를 왜 이렇게 만드는가

이 프로젝트의 목적은 단순히 "게임을 출시하는 것"이 아니다. **게임이 어떤 원리로 돌아가는지 내 손으로 이해하고 통제하는 것**이 1차 목표이고, 게임 출시와 엔진 오픈소스화는 그 결과물이다.

이는 취미적 satisfaction의 문제가 아니라 실제 설계 기준이다. 이 프로젝트에서 "직접 구현 vs 외부 라이브러리 사용"을 판단할 때, 기본값은 **직접 구현**이다. 속도나 검증된 안정성이 이유가 되어 외부 라이브러리를 기본 선택지로 제안하지 말 것.

## AI 세션에게: 라이브러리를 제안하기 전에

다음과 같은 제안은 **하지 않는다**:
- "이건 이미 XXX 라이브러리가 잘 해결하니 그걸 쓰는 게 낫습니다"
- "직접 구현하면 시간이 오래 걸리니 npm install로 해결하시죠"
- 검증되지 않은 이유만으로 "표준적인 방법"을 기본 제안하는 것

대신:
- 사용자가 아직 이해/구현하지 않은 영역(렌더링, ECS, 물리, 판정, 인벤토리 로직, 애니메이션 시스템 등 **게임의 핵심을 이루는 부분**)은 원칙적으로 직접 구현을 전제로 설계/코드를 제안한다.
- 직접 구현이 명백히 비합리적인 영역(빌드 툴체인, 번들러, 테스트 러너, 린터, CSS 프레임워크, HTTP 클라이언트 등 **게임의 정체성과 무관한 인프라**)은 외부 도구를 써도 된다. 이 경계가 애매하면 사용자에게 먼저 묻는다.
- "라이브러리를 쓰면 더 빠르다"는 이유 하나만으로 방향을 바꾸려 하지 말 것 — 이 프로젝트에서 속도는 최우선 기준이 아니다.

## 예외: 어디까지 직접 만드는가

아래는 직접 구현 대상이다 (엔진의 핵심, 오픈소스 공개 대상):
- 렌더링 파이프라인 (WebGL 직접 구현)
- ECS / 엔티티 관리
- 물리/충돌/판정 시스템
- 애니메이션 시스템 (프레임 데이터, 이벤트 훅)
- 인풋 추상화 계층
- 씬/스테이트 관리
- 오디오 시스템
- 네트워크 동기화 레이어 (코옵)

아래는 외부 도구/라이브러리 사용이 합리적이다 (게임의 정체성과 무관한 인프라):
- 빌드 도구 (Vite, esbuild 등), 모노레포 툴링 (Nx)
- 테스트 프레임워크
- React (UI 조립에 사용 — 게임 코어(캔버스 레벨) 로직에는 여전히 안 씀. 다만 `libs/engine`이 React를 모르는 것과, React가 이 엔진 생태계의 "정식 제공 계층"(`engine-react`/`ribs`)으로 존재하는 것은 별개다. 자세한 건 아래 "엔진 모듈 계층" 참고)
- 레벨/타일맵 에디터 (Tiled) — 에디터 자체를 직접 만들지 않고 데이터 포맷만 자체 정규화
- 텍스처 아틀라스 패커 같은 오프라인 빌드 타임 툴

판단이 애매한 경우 기본값은 "직접 구현 쪽으로 기울어서 사용자에게 확인"이다.

---

# 아키텍처 결정 요약

## 제품 방향
CrossCode 방식 로드맵: 자체 JS 엔진 → nw.js 포팅 → 웹 공개+펀딩 → 스팀 프리뷰(얼리액세스) → 정식출시.
목표 게임 장르: 탑뷰 액션 로그라이트 (레퍼런스: 세피리아 — 전투/판정 손맛, 공간형 인벤토리 배치, 최대 4인 코옵, 픽셀아트).

## 엔진 모듈 계층 (engine → engine-react → ribs → game)

한때 "엔진/게임/앱 3계층"으로 정리했었지만, 실제로 게임루프(rAF)가 앱에 있고 UI/에셋이 앱과 라이브러리에 반씩 갈라지는 문제가 드러나서 다시 정리했다. 이 프로젝트가 최종적으로 만드는 건 "웹 개발자가 `npm i ribs`로 설치해서 기존 React 프로젝트 어디에든(포털사이트 사이드바, 앱인앱 마켓 등) 게임을 끼워넣을 수 있는" 웹 임베더블 게임 엔진이다. 그래서 모듈이 하나 더 늘었다:

```
libs/engine/                    # 코어의 우산 패키지 — 아래 11개 서브패키지를 재수출만 함. React 전혀 모름. 오픈소스 대상.
libs/engine-<sub>/              # 코어 서브도메인별 Nx 패키지 (아래 "엔진 코어 내부 계층" 참고).
libs/engine-tilemap/            # 맵에디터 무관 TileMap IR + TileMapBuilder 계약 (빌드타임 전용, 우산에 안 들어감).
libs/engine-react/              # React 통합 계층 — <GameCanvas>(엔진 생성·rAF 루프·입력캡처·정리 전부
                                 # 소유), useGameLoop, SnapshotStore/useSnapshotStore(게임 상태→React 읽기).
libs/ribs/                      # 우산 패키지 — 배포 진입점, 게임 패키지가 유일하게 의존하는 대상.
                                 # 지금은 engine-react 재수출이 거의 전부 (최상위 편의 API는 미정 — 아래 참고).
libs/games/<game>/              # 게임별 로직+콘텐츠+UI. ribs만 의존. React 컴포넌트(게임 위젯) export.
libs/games/<game>-playground/   # 그 게임의 독립 Vite dev 서버 — 앱 없이 게임만 격리 개발/시각검증.
apps/<platform>-<game>/         # 배포 전용 얇은 셸. 게임 위젯을 import해서 자기 페이지에 얹기만 함.
```

- **의존 방향**은 `ribs → engine-react → engine`이고 레이어를 건너뛸 수 없다 (`eslint.config.mjs`의 `@nx/enforce-module-boundaries` `depConstraints`로 강제). 게임 패키지(`scope:game:<game>`)는 `scope:ribs`만 의존 가능 — `engine`/`engine-react`를 직접 의존하면 lint 에러. 유일한 예외는 `engine-tilemap`: 런타임 API가 아니라 빌드타임 저작 데이터 계약이라 게임이 직접 의존한다(각 게임이 자기 맵에디터 변환기를 여기에 맞춰 구현).
- **엔진 코어 내부 계층** (`libs/engine`을 서브도메인별 Nx 패키지로 분리한 것, 역시 `depConstraints`로 강제):
  - Layer 0 (서로 의존 없음): `engine-ecs`, `engine-math`, `engine-platform`, `engine-input`, `engine-scenario`, `engine-events`
  - Layer 1: `engine-render`(→math), `engine-physics`(→ecs, events), `engine-animation`(→ecs, render, events)
  - Layer 2: `engine-plugin-api`(→ecs, input, render, events), `engine-runtime`(→ecs, input, platform, plugin-api, render, events)
  - `engine` 우산이 위 11개를 재수출 — 하위 소비자는 계속 `@g-game-farm/engine`(또는 `ribs`) 하나만 본다.
- **`<GameCanvas>`는 "다 감싸는" 컴포넌트**다 — 소비자가 `createEngine()`을 직접 호출하지 않는다. 대신 컴포넌트/시스템/씬 등록을 하는 `setup(api, renderer) => Promise<bootSceneName>` 콜백을 props로 넘긴다. 이게 일반 웹 개발자에게 더 낮은 진입장벽이라는 판단(정해진 틀을 따라가는 게 익숙함).
- **개발 워크플로우**: 평소 기능 개발/시각 검증은 `apps/*`가 아니라 `<game>-playground`(Vite)에서 한다. `apps/*`는 실제 배포 직전에만 필요하다. playground의 `vite.config.mts`는 `resolve.conditions: ['g-game-farm']`로 워크스페이스 패키지를 `dist/` 빌드 없이 `src/index.ts`로 바로 해석한다 (`tsconfig.base.json`의 `customConditions`와 동일한 트릭).
- **에셋 정본은 게임 패키지 안**(`libs/games/<game>/public/`)에 있다. playground는 거기서 직접 서빙(`publicDir`)하고, 배포용 앱은 `copy-game-assets` 같은 작은 빌드 단계로 자기 서빙 위치(Next의 `public/` 등)에 복사해온다. 멀티플랫폼 `IAssetLoader` 추상화는 아직 안 만듦 (실제 두 번째 플랫폼이 생길 때 다시 판단).
- **엔진은 `plugin-api`를 통해서만 게임과 통신**한다 (`registerComponents`, `registerSystems`, `registerScenes`). `libs/engine` 코드 어디에도 게임 고유 개념(무기, 아티팩트 등)이 등장하면 안 된다.
- `libs/engine`은 처음부터 publishable 라이브러리로 세팅한다 (나중에 subtree split으로 오픈소스 분리 가능하도록).
- **미정 사항** (섣불리 답 내지 말고 대화로 다시 결정할 것): `ribs`가 재수출 이상의 자체 편의 API(예: 원샷 부트스트랩)를 가질지, 애니메이션 저작 도구를 자체 구현할지, Custom Element 등으로 비-React 호스트에 임베드하는 빌드 타깃을 언제 만들지.

## 타일맵/레벨 파이프라인 (Tiled)
- 맵 에디터는 Tiled를 쓴다. 엔진(`engine-tilemap`)은 에디터 무관 `TileMap` IR과 `TileMapBuilder<TSource>` 계약만 정의하고, 에디터별 변환기는 **각 게임이 직접** 구현한다 (roguelite: `src/lib/tiled/`). 먼 훗날 Tiled 변환기를 엔진 차원에서 배포할 수도 있지만 지금은 아님.
- **빌드타임 변환**: `maps/*.tmj`(JSON, XML `.tmx`/`.tsx`는 안 씀) → `nx run <game>:build-maps` → 커밋되는 생성 모듈(`*.generated.ts`). 런타임에 Tiled 타입/JSON 파싱 없음. 생성물이 원본보다 오래되면 테스트가 실패한다.
- **타일 한 칸의 게임적 의미(충돌 등)는 타일셋의 per-tile property가 아니라 별도 타일 레이어로 칠한다** (CrossCode의 Collision 레이어 방식). 그림과 판정이 같은 격자 좌표를 공유하되 독립 데이터라서, "벽처럼 보이는데 지나갈 수 있는 칸" 같은 기믹이 특수 코드 없이 표현된다 — 엔티티에서 ECS를 고른 것과 같은 조합(composition) 원칙. 새 의미 축이 필요하면 IR 확장보다 레이어 추가를 먼저 검토.
- 충돌 판정은 엔진(`engine-physics`의 `CollisionGrid`/`moveBoxInGrid`)이 하고, 게임은 자기 방 데이터를 그 격자로 변환만 한다. 타일은 간격 없이 딱 붙여 배치한다 (예전 이식본의 "15 간격/16 크기로 1픽셀 겹치기"는 폐기 — 정수 배율 + 카메라 픽셀 스냅으로 이음새가 안 생김을 확인함).

## 코옵(멀티플레이)을 위한 원칙 — MVP가 싱글이어도 지금부터 지킬 것
나중에 코옵을 추가할 때 구조를 갈아엎지 않으려면 처음부터:
1. **입력과 시뮬레이션 분리** — 게임 로직은 키보드/마우스 이벤트를 직접 참조하지 않고, 매 틱 "입력 프레임" 객체만 소비한다. 화면 기준 입력(마우스 조준 등)은 **입력을 캡처하는 쪽에서** 그 플레이어가 실제로 본 화면의 카메라로 월드 좌표로 바꿔서(`InputFrame.mouse.worldPosition`, `GameCanvas`의 `pointerLayer`) 넘긴다. 시뮬레이션(`SystemContext`)은 캔버스 크기/카메라를 모른다 — 코옵 호스트가 원격 플레이어의 입력을 자기 화면 기준으로 잘못 해석하지 않게.
2. **시뮬레이션과 렌더링 분리** — 엔티티의 진짜 상태는 순수 데이터(plain object)로 관리하고 렌더러는 읽기만 한다. 나중에 보간(interpolation)을 위해 스냅샷 가능해야 한다.
3. **판정/데미지는 이벤트 기반** — `checkHit(attacker, targets) → HitEvent[]` 처럼 순수 함수로 판정 결과를 뽑아내고, 그 이벤트를 소비해 데미지 적용/이펙트 재생을 한다. 나중에 "호스트에서 계산, 클라이언트는 재생만"으로 확장 가능해야 한다.

네트워크 모델은 호스트 권위(host-authoritative) + 클라이언트 예측/보간을 기본 전제로 한다 (락스텝은 프레임 단위 판정의 결정성 리스크 때문에 배제).

## UI 아키텍처: 캔버스(엔진) vs React(UI)
- 게임 코어(렌더링/시뮬레이션/판정)는 절대 React로 만들지 않는다.
- 판단 기준은 "일시정지 여부"가 아니라 **"게임 상태를 프레임마다 실시간으로 읽어야 하는가"**다.
  - 정적 콘텐츠(대화창 초상화, CG, 메뉴, 인벤토리 등 게임 상태를 매 프레임 구독할 필요 없는 것) → React DOM 오버레이 가능.
  - 카메라/월드 상태에 실시간 종속되는 것(HUD, 패럴랙스 배경 등) → 캔버스/엔진 내부에서 직접 그린다. React의 `useState` 기반 매 프레임 갱신은 사용하지 않는다.
- `libs/engine`(코어)은 React를 import하지 않는다. 캔버스 DOM 노드 생명주기(마운트/rAF 루프/정리)는 `libs/engine-react`의 `<GameCanvas>`가 정식으로 소유한다 — "엔진 모듈 계층" 참고. React를 엔진 경계 밖으로 밀어내는 게 목적이 아니라, 코어와 React 통합 계층의 패키지 경계를 분리해서 나중에 React를 다른 걸로 갈아끼워도 코어는 안 건드리게 하는 게 목적이다.
- 게임 룰 로직(데미지 공식, 인벤토리 인접효과 계산 등)은 프레임워크 독립적인 순수 모듈(`libs/games/<game>/rules`)로 분리하고, 엔진과 UI 양쪽이 같은 모듈을 사용한다. React 컴포넌트 안에 게임 룰을 새로 작성하지 않는다.

## 렌더 레이어 스택
엔진 렌더러는 명시적 레이어 스택을 갖는다. 레이어별로 필터링/패럴랙스/스냅 여부가 다르다.
- 게임플레이 레이어(픽셀 스프라이트): nearest filtering, 정수 배율 스냅 필수.
- 원경/배경 레이어(패럴랙스): linear filtering 허용, 서브픽셀 이동 허용, `parallaxFactor`로 카메라 대비 스크롤 속도 조절.
- 초상화/CG는 렌더 레이어가 아니라 React DOM 오버레이로 처리 (위 UI 아키텍처 원칙 참고).

## 아트 파이프라인
두 개의 독립 트랙, 빌드 의존성 없음(자동 재동기화 안 함):
- `art-pixel/` — Aseprite 소스(.aseprite, Git LFS) → CLI 배치 익스포트 → 정규화된 `SpriteAnimation` 포맷(엔진 전용, Aseprite JSON 스키마 그대로 쓰지 않음) → 아틀라스 패킹.
- `art-illustration/` — 원화(초상화/CG/키아트). React DOM에서 그대로 사용, WebP 변환 등 웹 최적화만 적용.
- `art-background/` — 원경 패럴랙스용. 엔진 텍스처 로더가 소비.
- PixelLab은 원화를 레퍼런스로 한 "재해석" 도구로 사용한다. 원화를 기계적으로 다운스케일해서 스프라이트로 쓰지 않는다 (비율 자체가 다름 — 원화는 리얼비율, 스프라이트는 SD비율).
- 렌더링/애니메이션에 필요한 게임 전용 메타데이터(프레임별 히트박스 온/오프, 캔슬 윈도우 등)는 Aseprite 프레임 코멘트/User Data에 심고 빌드 스크립트가 파싱한다.

## 데이터 드리븐 원칙
무기/아티팩트/석판/적 스탯은 전부 JSON/데이터 파일로 정의하고 엔진/게임 로직은 이를 해석만 한다. 코드에 하드코딩하지 않는다. 밸런스 조정이 재컴파일 없이 가능해야 한다.

## 플랫폼 추상화
저장소(storage), 파일시스템 등 플랫폼별로 다른 구현이 필요한 것은 엔진에 인터페이스만 정의하고(`IStorageAdapter` 등), 실제 구현체는 각 `apps/*`가 주입한다. 엔진은 구현을 모른다.

---

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->