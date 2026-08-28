# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **저장소 현황**: 이 저장소는 아직 코드가 없는 초기 단계다 (커밋 없음, `package.json`/빌드 설정/소스 디렉토리 없음). 아래는 프로젝트를 시작하기 전에 미리 정해둔 철학과 아키텍처 결정 사항이다. 실제 코드가 생기기 전까지는 빌드/린트/테스트 명령이 존재하지 않으니 찾으려 하지 말고, 새 코드를 작성할 때 아래 원칙을 따를 것.

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
- React (UI 셸에 한정 — 게임 코어 로직에는 사용하지 않음, 별도 원칙 참고)
- 레벨/타일맵 에디터 (Tiled) — 에디터 자체를 직접 만들지 않고 데이터 포맷만 자체 정규화
- 텍스처 아틀라스 패커 같은 오프라인 빌드 타임 툴

판단이 애매한 경우 기본값은 "직접 구현 쪽으로 기울어서 사용자에게 확인"이다.

---

# 아키텍처 결정 요약

## 제품 방향
CrossCode 방식 로드맵: 자체 JS 엔진 → nw.js 포팅 → 웹 공개+펀딩 → 스팀 프리뷰(얼리액세스) → 정식출시.
목표 게임 장르: 탑뷰 액션 로그라이트 (레퍼런스: 세피리아 — 전투/판정 손맛, 공간형 인벤토리 배치, 최대 4인 코옵, 픽셀아트).

## 엔진 / 게임 / 앱 3계층 분리
```
libs/engine/         # 오픈소스 대상. 어떤 게임인지 전혀 모름. React 절대 참조 금지.
libs/games/<game>/   # 게임별 순수 로직 + 콘텐츠 + UI. 여러 게임 동시 개발 가능.
apps/<platform>-<game>/  # 얇은 포팅 셸 (Next.js 웹, nw.js 등). 실제 로직 없음.
```
- 엔진은 `plugin-api`를 통해서만 게임과 통신한다 (`registerComponents`, `registerSystems`, `registerScenes`). 엔진 코드 어디에도 게임 고유 개념(무기, 아티팩트 등)이 등장하면 안 된다.
- `libs/engine`은 처음부터 publishable 라이브러리로 세팅한다 (나중에 subtree split으로 오픈소스 분리 가능하도록).
- Nx 태그로 경계 강제: `scope:engine`은 다른 어떤 것도 의존 불가, `scope:game:X`는 engine만 의존 가능하고 다른 게임(`scope:game:Y`)은 의존 불가.

## 코옵(멀티플레이)을 위한 원칙 — MVP가 싱글이어도 지금부터 지킬 것
나중에 코옵을 추가할 때 구조를 갈아엎지 않으려면 처음부터:
1. **입력과 시뮬레이션 분리** — 게임 로직은 키보드/마우스 이벤트를 직접 참조하지 않고, 매 틱 "입력 프레임" 객체만 소비한다.
2. **시뮬레이션과 렌더링 분리** — 엔티티의 진짜 상태는 순수 데이터(plain object)로 관리하고 렌더러는 읽기만 한다. 나중에 보간(interpolation)을 위해 스냅샷 가능해야 한다.
3. **판정/데미지는 이벤트 기반** — `checkHit(attacker, targets) → HitEvent[]` 처럼 순수 함수로 판정 결과를 뽑아내고, 그 이벤트를 소비해 데미지 적용/이펙트 재생을 한다. 나중에 "호스트에서 계산, 클라이언트는 재생만"으로 확장 가능해야 한다.

네트워크 모델은 호스트 권위(host-authoritative) + 클라이언트 예측/보간을 기본 전제로 한다 (락스텝은 프레임 단위 판정의 결정성 리스크 때문에 배제).

## UI 아키텍처: 캔버스(엔진) vs React(UI)
- 게임 코어(렌더링/시뮬레이션/판정)는 절대 React로 만들지 않는다.
- 판단 기준은 "일시정지 여부"가 아니라 **"게임 상태를 프레임마다 실시간으로 읽어야 하는가"**다.
  - 정적 콘텐츠(대화창 초상화, CG, 메뉴, 인벤토리 등 게임 상태를 매 프레임 구독할 필요 없는 것) → React DOM 오버레이 가능.
  - 카메라/월드 상태에 실시간 종속되는 것(HUD, 패럴랙스 배경 등) → 캔버스/엔진 내부에서 직접 그린다. React의 `useState` 기반 매 프레임 갱신은 사용하지 않는다.
- React는 캔버스 DOM 노드의 생명주기만 관리하는 얇은 wrapper다. 엔진은 React를 import하지 않는다.
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