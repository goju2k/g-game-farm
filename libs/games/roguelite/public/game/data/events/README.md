# 이벤트 스크립트 형식 (v1)

기획 방이 직접 쓰는 이벤트·대사 데이터. 기준 명세: `_design/docs/23_event-dialogue-spec-v1.md`.
파일을 고치고 **브라우저 새로고침만** 하면 반영된다 (재빌드 없음). 시작할 때 전부 검사하므로,
모르는 명령·트리거·빠진 칸이 있으면 게임이 뜨지 않고 콘솔에 목록이 나온다.

```jsonc
{
  "speakers": { "companion": { "name": "빛", "color": "#fbf236" } },   // say의 화자 표시
  "rooms": {
    "<방 id>": [
      { "id": "<이벤트 id>", "trigger": { ... }, "repeat": false, "do": [ <명령>, ... ] }
    ]
  }
}
```

- 이벤트는 기본 **한 번만** 실행되고 기억된다 (방에 다시 들어오거나 체크포인트 재시작해도 다시 안 나옴). 반복하려면 `"repeat": true`.
- 시간은 모두 **ms**, 게임 시간 기준 (일시정지·세로 화면이면 같이 멈춤).
- 위치(`at`, `to`, `toward`, 경로 점)는 다음 중 하나:
  - 방의 **이름 붙은 점** — 방 지도(ASCII)의 글자 하나 (예: `"A"`, `"t"`), 방 정의의 추가 점
  - **배우 id** — `"player"`(=`"ember"`), `"companion"`, `"artifact"`, spawn/light.spawn으로 만든 id
  - 절대 좌표 `{ "x": 100, "y": 40 }`
  - 상대 좌표 `{ "dx": -8 }` (직전 점/현재 위치 기준) / `{ "of": "player", "dx": 20, "dy": -8 }`

## 트리거

| type | 칸 | 언제 |
|---|---|---|
| `roomStart` | — | 방에 들어온 첫 틱 |
| `enterArea` | `area`: 지도 글자 | 플레이어 몸이 그 글자 칸들(을 감싼 사각형)에 닿음 |
| `interact` | `target`: 배우 id | 플레이어가 그 배우에 12px 이내로 닿음 |
| `flag` | `flag` | 방 플래그가 켜짐 (`setFlag`, 수호체 정지 `cleared`, 덩굴 `vine-burned` 등) |
| `failCount` | `key`, `n` | 같은 실패가 n번 쌓임 (지금 있는 키: `vine-touch`) |
| `idle` | `ms` | 입력 없이 ms 경과 (입력 잠금 중은 안 셈) |

## 명령

| cmd | 칸 | 기다림 | 설명 |
|---|---|---|---|
| `wait` | `ms` | ✔ | |
| `parallel` | `do`: [명령] | ✔ (전부) | 동시에 시작, 전부 끝나면 다음 |
| `async` | `do`: [명령] | — | 시작만 하고 바로 다음 (이벤트 종료는 이것까지 끝나야) |
| `setFlag` | `flag`, `value`(기본 true) | | |
| `if` | `flag`, `then`: [명령], `else`: [명령] | ✔ | 분기는 플래그만 |
| `lockInput` / `unlockInput` | | | 잠금 중: 플레이어 정지, 터치 버튼 숨김, 건너뛰기 버튼 표시 |
| `fade` | `to`: `"in"`/`"out"`, `ms`, `color`: `"black"`/`"white"` | ✔ | |
| `camera.pan` | `to`: 위치 **또는** `toward`: 위치 + `px`, `ms`, `ease`(`"linear"`이면 등속) | ✔ | 기본 천천히 시작·멈춤 |
| `camera.follow` | `target`(기본 player) | | 이벤트가 다 끝나면 자동으로 player로 돌아옴 |
| `camera.shake` | `px`, `ms` | | |
| `light.ambient` | `to`(0~1, 기본 0.30), `ms` | ✔ | 방 전체 밝기 |
| `light.tween` | `target`: 배우 id / `"ember"` / `"player.handFlame"`, `radius`, `ms` | ✔ | `ember`는 빛과 함께 모습도 나타남/사라짐 |
| `light.spawn` | `id`, `at`, `color`: `"gold"`/`"cold"`, `radius` | | 빛 + 작은 빛점 |
| `light.remove` | `id` | | |
| `spawn` / `despawn` | `kind`: `"companion"`/`"artifact"`, `id`, `at` / `id` | | |
| `move` | `id`, `path`: [위치 또는 `{ "orbit": 배우, "radius", "turns" }`], `speed`(px/s) | ✔ | 충돌 무시. `turns` 0.5 = 반 바퀴, 음수 = 반대 방향 |
| `face` | `id`, `toward`: 위치 | | |
| `anim` | `id`, `clip` | | 그 클립이 있을 때만 |
| `setBrightness` | `id`, `level`(0~3) | | 동반자 빛 단계 |
| `follow` | `id`, `on`(기본 true) | | 동반자가 플레이어를 따라다님 |
| `setForm` | `form`: `"ember"`/`"child"` | | 폼체인지 |
| `emote` | `id`, `icon`: `"…"`/`"!"`/`"?"`, `ms`(기본 900) | ✔ | 머리 위 말풍선 |
| `say` | `speaker`, `text`, `auto`(ms) | ✔ | 대사창. 문장 안에 `{pause:ms}`, `{dim}` |
| `goRoom` | `room`, `entry` | | 방 이동 |
| `sfx` | `id`, `volume`(0~1, 생략 가능) | | 효과음. 예: `{ "cmd": "sfx", "id": "door-open", "volume": 0.8 }` |
| `bgm` | `id`(`null`이면 페이드아웃), `fadeMs` | | 배경음. 교차 페이드, 방을 옮겨도 계속 흐름. 예: `{ "cmd": "bgm", "id": "part0-drone", "fadeMs": 1200 }` |

- 소리 id 목록: `public/game/data/sounds.json`. 파일이 없는 id는 무음(`?debug`에서는 삑 소리로 대체).

### 대사(say) 동작

- 초당 30자, 쉼표 뒤 0.1초·마침표/…/!/? 뒤 0.25초.
- **입력 잠금 중**: 화면 아무 데나 탭 / Space / Enter / 클릭 → 타자 중이면 문장 완성, 완성됐으면 다음.
- **잠금 아님**(걸으면서 듣는 대사): 대사창을 탭해야 넘어가고, 다 보인 뒤 3초면 저절로 닫힘.
- `auto`: 다 보인 뒤 그 ms가 지나면 저절로 다음.
- `{dim}`: 거기까지 타자가 오면 화자(동반자) 빛이 한 단계 어두워짐.
- 건너뛰기: 입력 잠금 중 "건너뛰기"를 1초 누르면 그 장면을 끝 상태로 즉시 실행.
