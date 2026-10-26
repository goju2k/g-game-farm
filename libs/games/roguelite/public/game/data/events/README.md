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
| `interact` | `target`: 배우 id | **살펴볼 수 있는 대상**(흔적·받침대 — 아래 "길찾기 개체")은 **살펴봤을 때**(24px 안에서 E / 그 위 클릭 / 화면 탭). 그 밖의 배우(아티팩트 등)는 12px 이내로 닿으면 |
| `flag` | `flag` | 방 플래그 또는 **진행 플래그**가 켜짐 (`setFlag`, 수호체 정지 `cleared`, 덩굴 `vine-burned`, 화로 `brazier-w`/`brazier-n`, 금 간 벽 `crack-room3` 등) |
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
| `record` | `id` | ✔ | 기록창 (records.json의 그 id). 닫힐 때까지 기다리고, 열려 있는 동안 게임이 멈춤. 기록 id가 붙은 흔적은 살펴볼 때 **자동으로** 열리므로 따로 안 써도 됨 |
| `unlockSkill` | `skill`(기본 `"pillar"`) | | 스킬 해금(불기둥). 받침대를 살펴보면 자동 해금 — 스크립트로 따로 줄 때만 |
| `spawn` + `"kind": "prop"` | `id`, `sprite`(그림 id), `clip`(기본: 첫 클립), `at`, `layer`(`"overlay"`면 조명 위에 — 바람·빛 효과), `light`(`{ "radius", "color": "warm"/"cold" }`), `flip` | | 연출용 소품 배우 (D-037). `anim`·`move`·`despawn`이 그대로 됨. 그림이 아직 없으면 작은 회색 상자 |
| `anim` + `"speed"` | `speed`(재생 배속, 0.5 = 절반) | | 같은 그림을 느리게/빠르게. 새 클립을 틀면 1로 돌아옴 |
| `light.spawn` + `"motion"` | 스타일 이름(`sealLamp`·`sealGlyph`·`crystal`·`brazier`) 또는 `{ "pulse": { "amp", "periodMs" }, "flicker": {...} }` | | 빛이 숨 쉬듯 맥동 / 일렁임 (반지름의 비율) |
| `anim` + `"hold": true` | | | 플레이어에게 준 클립은 끝날 때까지(hold면 다음 anim까지) 전투 동작이 덮어쓰지 않음 |
| `place` | `id`, `at` | | 배우를 그 자리로 즉시 옮김(순간 이동). `at`에 배우 id를 쓰면 그 배우 위치 — 예: 숨긴 플레이어를 로브 자리로 |
| `hide` / `show` | `id` | | 배우 숨김/보임 — 그림·빛·그림자 모두. 플레이어도 됨(입력 잠금과 함께 쓸 것) |
| `highlight` | `in`(250) `hold`(300) `out`(600) ms | ✔ in+hold | 흰빛이 화면 가장자리부터 차올라 덮고, 유지, 걷힘. in+hold만큼 기다리므로 바로 다음 명령들이 흰빛 아래에서 바뀜 |
| `setForm` + `"intro"` | `form`, `intro`(클립), `quiet`(true면 폼체인지 효과음 없음) | | 폼체인지와 동시에 새 폼의 등장 클립. 숨긴 상태였으면 계속 숨김(`show`로 드러냄) |
| `hint` | `id`, `hide`(true면 숨김) | | 그림 안내(D-035)를 띄움 — 그 기술을 쓰면 영구히 사라짐. 안내 정의(키·터치 버튼·그림·자동으로 뜨는 때)는 `data/hints.json` |
| `lockRoom` / `unlockRoom` | | | 방의 출구를 잠금 / 풂 (아레나). 잠긴 동안 출구에 창살이 보임 |
| `setFlag` + `"progress": true` | `flag` | | 방을 나가도 남는 **진행 플래그**로 켬 (체크포인트에 저장) |

## 길찾기 개체 (지인 공유판, 기획 31)

엔진 방이 방 지도에 배치한다. 스크립트에서는 아래 **배우 id**와 **플래그**로 다룬다.

| 개체 | 배우 id / 플래그 | 동작 |
|---|---|---|
| 흔적 — scar 긁힌 벽 | `trace-scar` (기록 `rec-scar`) | 살펴보면 기록창 → 닫힌 뒤 `interact` 이벤트 |
| 흔적 — tablet 깨진 비석 | `trace-tablet` (`rec-tablet`) | 〃 |
| 흔적 — mural 벽화 | `trace-mural` (`rec-mural`) | 〃 (동반자 첫 기록 반응은 이 `interact`에) |
| 흔적 — crack 숨은 방 벽화 | `trace-crack` (`rec-crack`) | 〃 |
| 스킬 받침대 (shrine) | `pedestal` | 살펴보면 불기둥 해금 → `interact` 이벤트 ("이것저것 섞어 봐!") |
| 화로 (brazier-w / brazier-n 방) | 플래그 `brazier-w` / `brazier-n` | 불꽃탄·불기둥에 맞으면 켜짐 → 진행 플래그 + 따뜻한 빛이 출구 쪽으로 번짐 |
| hub 받침 2개 | — | 화로 플래그가 켜지면 불이 들어옴 |
| hub 봉인문 (동) | — | `brazier-w`와 `brazier-n`이 둘 다 켜지면 열림 |
| hub 덩굴문 (북) | 플래그 `vine-hub-north` | 3번 맞혀야 탐. 실패 힌트는 `failCount` `vine-touch` |
| room-3 금 간 벽 (남) | 플래그 `crack-room3` | 마무리 큰 불기둥(R R / L R)에만 무너짐 |
| room-3 아레나 | 플래그 `cleared` | 근접형이 모두 쓰러지면 켜짐 — 잠금·해제는 스크립트로 |

예: room-3 입장 잠금
```json
{ "id": "arena-lock", "trigger": { "type": "roomStart" }, "do": [{ "cmd": "lockRoom" }] },
{ "id": "arena-open", "trigger": { "type": "flag", "flag": "cleared" }, "do": [{ "cmd": "unlockRoom" }] }
```

방 id: `scar` `tablet` `hub` `room-1` `brazier-w` `mural` `shrine` `room-2` `brazier-n` `room-3` `crack` `ante` `boss`. 방의 이름 붙은 점은 지도 글자(rooms/demo-rooms.ts — 예: hub의 `o` 가운데 봉인 문양, `E` 입구).

## 기록 (records.json)

이 폴더의 `records.json`. 화면에서는 글자마다 정해진 고대 기호로 바뀐다(같은 글자 = 같은 기호). `readable: true`면 그대로 보임(해독 후).
```json
{ "records": { "rec-scar": { "text": "그것이 깨어나면 먼저 작아진다. 작은 것을 두려워하라.", "readable": false } } }
```

### 대사(say) 동작

- 초당 30자, 쉼표 뒤 0.1초·마침표/…/!/? 뒤 0.25초.
- **입력 잠금 중**: 화면 아무 데나 탭 / Space / Enter / 클릭 → 타자 중이면 문장 완성, 완성됐으면 다음.
- **잠금 아님**(걸으면서 듣는 대사): 대사창을 탭해야 넘어가고, 다 보인 뒤 3초면 저절로 닫힘.
- `auto`: 다 보인 뒤 그 ms가 지나면 저절로 다음.
- `{dim}`: 거기까지 타자가 오면 화자(동반자) 빛이 한 단계 어두워짐.
- 건너뛰기: 입력 잠금 중 "건너뛰기"를 1초 누르면 그 장면을 끝 상태로 즉시 실행.
