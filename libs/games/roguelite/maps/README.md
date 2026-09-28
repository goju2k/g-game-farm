# roguelite 맵 (Tiled)

Tiled로 저작하는 방 원본. 여기 있는 파일은 게임 번들에 직접 들어가지 않는다 —
`nx run roguelite:build-maps`가 `*.tmj`를 엔진의 `TileMap` 형식으로 변환해서
`src/lib/rooms/maps/*.generated.ts`로 생성하고, 게임은 그 생성물만 import한다.
`.tmj`를 고친 뒤 재생성을 잊으면 `nx test roguelite`가 실패해서 알려준다.

## 저장 형식

- 맵은 JSON(`.tmj`), 타일셋도 JSON(`.tsj`)으로 저장한다 (`.tmx`/`.tsx` XML은 쓰지 않음).
- 맵 속성: Orientation `Orthogonal`, Tile size `16x16`, **Infinite 체크 해제**,
  Tile Layer Format `CSV`(기본값). 타일 뒤집기(X/Y 키)는 쓰지 않는다 — 변환기가 에러를 낸다.

## 타일셋

| 파일 | 이름 | 용도 |
|---|---|---|
| `tiles.tsj` | `tiles` | 실제 그림 (`public/game/map/tiles.png`, 10열) |
| `collision.tsj` | `collision` | 충돌 팔레트 — 에디터 안에서만 보이는 표시용, 게임엔 안 들어감 |

한 레이어는 한 타일셋만 써야 한다 (섞으면 변환기가 에러).

## 레이어 규칙

- **`collision`** (타일 레이어, `collision` 타일셋) — 칠한 칸 = 막힌 칸. 그림과 독립적이라
  벽처럼 보이는데 지나갈 수 있는 칸(비밀통로)도 여기서 만든다. 필수.
- **그 외 모든 타일 레이어** (`tiles` 타일셋) — 그림. 위에서부터가 아니라 **목록 아래쪽 레이어가 먼저**
  (Tiled 표시 순서 그대로) 그려진다.
- **오브젝트 레이어** (이름 자유, 보통 `markers`) — 오브젝트의 `Class`(JSON의 `type`)로 구분:
  - `entryPoint` — 점(Point) 오브젝트. 커스텀 속성 `id`(string): 다른 방의 출구가 가리키는 이름.
    플레이어 스프라이트의 좌상단이 이 점에 놓인다.
  - `exit` — 사각형 오브젝트 = 들어서면 방이 바뀌는 영역. 커스텀 속성
    `id`, `targetRoomId`, `targetEntryId`(string), 선택 `lockedUnlessFlag`(string: 이 방의 플래그가 켜져야 열림).
  - 모르는 Class가 있으면 변환 단계에서 에러.

좌표: 맵 좌상단 = 월드 (0, 0), 1픽셀 = 1 월드 단위.
