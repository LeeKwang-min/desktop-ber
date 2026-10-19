# 베르(Ber) 데스크톱 고양이 — 설계 문서

- 작성일: 2026-10-16
- 상태: 승인됨 (설계 1~3은 대화에서 승인, 4~5는 사용자가 "전부 추천대로"로 위임)

## 1. 개요

사용자가 기르는 검은 턱시도 고양이 "베르"를 3D로 만들어, 살짝 기울인 탑뷰 시점에서 화면 위를 돌아다니게 하는 데스크톱 펫 앱.

### 목표
- 가족(macOS·Windows 사용자)이 터미널 명령 한 줄로 설치해서 쓸 수 있다.
- 화면 속 고양이를 보고 가족이 "베르다"라고 알아본다.
- 평소에는 작업을 방해하지 않는다(클릭 통과, 대부분 쉬는 중).

### 비목표 (V1)
- 소리, 다른 고양이 추가, 설정 화면(트레이 메뉴로 충분), 자동 업데이트, 공증·코드 서명, App Store·winget 배포.

### 성공 기준
1. macOS(Apple Silicon/Intel)와 Windows 10/11에서 실행된다.
2. 베르가 모든 모니터를 오가며 걷기·식빵·그루밍·옆으로 눕기/몸 말고 자기·배까기를 한다.
3. 베르 위가 아닌 곳의 클릭은 아래 앱으로 그대로 전달된다.
4. 베르를 클릭하면 반응한다. 커서·창에 상황별로 반응한다.
5. `brew install --cask leekwang-min/tap/ber` / `scoop install ber`로 설치 시 보안 경고 없이 실행된다(Windows 스마트 앱 컨트롤이 켜진 PC는 예외).
6. 쉬는 동안 CPU 사용률이 낮다(목표: 쉬는 중 5% 미만, Apple Silicon 기준).

## 2. 결정 요약

| 항목 | 결정 |
|---|---|
| 사용자 | 가족 배포 먼저, 이후 공개 가능성 |
| 플랫폼 | macOS 14+ (universal), Windows 10/11 x64 |
| 기술 | Tauri 2 + TypeScript + three.js (Vite) |
| 이름 | 표시 이름 "베르", 패키지·바이너리 `ber`, 번들 ID `com.leekwangmin.ber` |
| 레포 | `LeeKwang-min/desktop-ber`, `LeeKwang-min/homebrew-tap`, `LeeKwang-min/scoop-bucket` |
| 오버레이 | 모니터마다 전체화면 투명 창 1개 |
| 시점 | 직교 카메라, 수직에서 38° 기울인 탑뷰 |
| 외형 | A 스타일 · 기본 체형 · 기본 귀 · 5단계 툰 명암 (`docs/mockups/style-final.html` 2번) |
| 활동량 | 트레이에서 실제 고양이처럼(기본) / 반반 / 활발하게 |
| 커서 반응 | 상황 따라: 깨어 있으면 쫓기, 자고 있으면 귀만 쫑긋 |
| 클릭 반응 | 기분 따라 랜덤: 골골송 위주, 가끔 배까기, 연타 시 귀찮아하며 자리 뜸 |
| 레이어 규칙 | 평소엔 모든 창 위, 숨을 때만 특정 창 밑 |
| 크기 | 트레이에서 작게/보통/크게, 기본 보통 |
| 소리 | 없음 |

## 3. 아키텍처

```
desktop-ber/
├─ src-tauri/                 Rust: OS와 맞닿는 얇은 층
│  ├─ src/main.rs             진입점 (lib::run 호출)
│  ├─ src/lib.rs              앱 셋업: 플러그인, 오버레이 창 생성, 폴러 시작
│  ├─ src/overlay.rs          모니터별 오버레이 창 생성/재생성
│  ├─ src/tray.rs             트레이 메뉴
│  ├─ src/poller.rs           커서(60Hz)·창 목록(10Hz)·모니터 상태를 이벤트로 방송
│  ├─ src/geometry.rs         공용 타입(Rect, WinInfo, MonitorInfo)과 좌표 변환
│  └─ src/window_list/
│     ├─ mod.rs               공통 필터(순수 함수, 단위 테스트 대상)
│     ├─ macos.rs             CGWindowListCopyWindowInfo
│     └─ windows.rs           EnumWindows + DwmGetWindowAttribute
└─ src/                       TypeScript: 베르의 모든 것
   ├─ main.ts                 웹뷰 진입점: 역할(brain/뷰어) 결정, 루프 시작
   ├─ bridge.ts               Tauri 이벤트/명령 래퍼 (유일한 Tauri 의존 지점)
   ├─ world.ts                모니터·창·커서 상태 + 좌표 변환 (순수)
   ├─ brain/                  행동 AI (순수 TS, three.js 의존 없음)
   │  ├─ brain.ts             상태 머신
   │  ├─ presets.ts           활동량 프리셋 표
   │  └─ rng.ts               주입 가능한 난수 생성기
   ├─ cat/
   │  ├─ params.ts            확정된 외형 파라미터
   │  ├─ model.ts             코드로 만드는 메시 + 뼈대
   │  ├─ poses.ts             자세 정의(뼈 각도 묶음) + 전환 그래프
   │  └─ animator.ts          자세 보간 + 보행 + 덧씌우는 동작
   ├─ render.ts               three.js 렌더 + 창 영역 마스킹 + scissor
   ├─ hit.ts                  커서가 베르 위에 있는지 판정 → 클릭 통과 전환
   └─ gallery.ts              개발용 자세 갤러리 (`?gallery`)
```

### 데이터 흐름
```
Rust poller ─ cursor(60Hz) / windows(10Hz) / monitors(변경 시) ─▶ 모든 웹뷰
Rust tray   ─ command(summon/hide/show/activity/size) ───────────▶ brain 웹뷰
brain 웹뷰  ─ cat-state(매 프레임: 위치·방향·자세·덧씌울 동작·레이어) ─▶ 모든 웹뷰
각 웹뷰     ─ 자기 모니터 영역과 베르가 겹치면 렌더, 클릭 통과 여부 판정
```

- **두뇌는 하나**: 주 모니터 웹뷰가 `brain` 역할을 맡는다. 웹뷰는 시작 시 Rust에 자기 모니터가 주 모니터인지 묻고 역할을 정한다. 모니터 구성이 바뀌면 오버레이를 재생성하고 역할도 다시 정한다.
- **방송**: `cat-state`는 Tauri 이벤트(`emit`)로 보낸다. 페이로드는 수십 바이트 JSON. 보조 모니터는 한 프레임 늦게 그릴 수 있지만 허용한다.
- **Rust는 상태를 갖지 않는다**: 폴링·변환·전달만 한다. 베르의 로직은 전부 TS.

## 4. 좌표계

- **월드 좌표**: OS가 창 위치를 보고하는 전역 데스크톱 좌표. 좌상단 원점, y는 아래로.
  - macOS: 포인트 단위(`CGWindowListCopyWindowInfo`의 `kCGWindowBounds`와 같음).
  - Windows: 물리 픽셀(per-monitor DPI aware v2, `GetWindowRect`/`DWMWA_EXTENDED_FRAME_BOUNDS`와 같음).
- Rust가 모니터 정보를 월드 좌표의 `rect`와 `cssPerWorld`(웹뷰 CSS px ÷ 월드 단위: macOS 1, Windows 1/scaleFactor)로 보낸다.
- 웹뷰의 로컬 CSS 좌표 = `(world - monitor.rect.origin) * cssPerWorld`. 변환은 `world.ts`의 순수 함수이며 단위 테스트한다.
- 베르의 크기는 월드 단위가 아니라 **CSS px**로 정한다(DPI가 다른 모니터에서도 같은 크기로 보이게). 몸 길이 기준 작게 90 / 보통 130 / 크게 180 CSS px.

## 5. 베르 모델과 애니메이션

### 5.1 외형 파라미터 (확정)
단위는 몸 크기 기준 임의 단위이며, 렌더 시 크기 설정에 맞게 스케일한다.

| 파라미터 | 값 |
|---|---|
| 몸통 반지름 a/b/c (앞뒤/위아래/좌우) | 0.46 / 0.21 / 0.25 |
| 엉덩이 폭 계수 `rump` | 1.12 |
| 다리 길이 / 반지름 | 0.20 / 0.05 |
| 꼬리 길이 / 반지름 / 들림 | 0.72 / 0.042 / 0.22 |
| 머리 반지름 / 스케일 | 0.20 / (1, 0.9, 1.08) |
| 머리 위치 계수 hx / hy | 0.86 / 0.60 |
| 볼살 / 콧수염 패드 | 0.55 / 1.0 |
| 귀 (원뿔) 높이 / 반지름 / 바깥 기울기 | 0.20 / 0.095 / 0.45 rad, 속귀 없음 |
| 눈 반지름 / 벌어짐 / 높이 / 홍채색 | 0.16 / 0.40 / 0.10 / `#c5d63d` |
| 털 / 흰색 / 코 / 동공 | `#23252b` / `#f4f3ee` / `#1a1a1d` / `#0c0c0e` |
| 명암 | MeshToonMaterial, 그라디언트 5단계 `[60,105,150,200,255]` |
| 윤곽 빛(rim) | 세기 0.35, 색 (0.62, 0.71, 0.85), 지수 3, `1 - normal.z` 기반 |
| 수염 | 좌우 3가닥, 길이 = 머리 반지름 × 2.0, 흰색 선 |
| 조명 | Ambient 0.9 + Directional 2.2 at (-2, 6, -2.5) |
| 그림자 | 방사형 그라디언트 평면, 별도 씬에 먼저 렌더 |

무늬(사진 기준): 코 아래 주둥이와 턱 흰색, 흰 콧수염 패드, 흰 턱받이(가슴), 앞발은 발가락 끝만 흰색, 뒷발은 흰 양말(다리 아래 42%), 나머지 검정, 배는 검정.

### 5.2 구조
- **몸통**: 시안의 loft 메시(척추를 따라 단면 링을 이은 것)를 `SkinnedMesh`로 바꾸고 척추 뼈 5개(엉덩이→가슴)에 스키닝한다. 각 정점은 x 위치에 따라 인접한 두 뼈에 선형 가중치로 묶는다.
- **머리**: 가슴 뼈의 자식인 목 관절에 붙는 강체 그룹(머리·볼·주둥이·눈·귀·수염).
- **다리**: 어깨/엉덩이 관절 → 윗다리 → 무릎/팔꿈치 관절 → 아랫다리 + 발. 각각 캡슐 메시.
- **꼬리**: 엉덩이 뼈에 붙는 관절 체인 8마디. 매 프레임 관절 위치로 튜브를 다시 만든다(시안과 동일 방식).
- **눈꺼풀**: 눈마다 털색 반구 껍데기. 회전으로 뜬 눈(0) / 졸린 눈(0.5) / 감은 눈(1)을 표현한다.

### 5.3 자세
자세 = 뼈 각도 묶음(척추 5, 목, 머리, 다리 4×2, 꼬리 기본 곡선) + 몸 높이 + 몸 롤(눕기/배까기).

| 자세 | 설명 |
|---|---|
| `stand` | 기본. 걷기/뛰기 보행이 이 위에 덧씌워짐 |
| `sit` | 뒷다리 접고 몸통 앞쪽을 들어 올림 |
| `loaf` | 네 다리를 몸 밑으로 접음, 몸 낮춤, 졸린 눈 |
| `groom` | 앉은 자세에서 앞발 하나를 들고 머리를 숙여 핥는 반복 |
| `lieSide` | 옆으로 누움(롤 90°), 다리 뻗음 |
| `curl` | 옆으로 누운 채 척추를 말아 도넛 모양, 꼬리로 몸 감쌈, 감은 눈 |
| `bellyUp` | 등을 대고 뒤집힘(롤 ~160°), 앞발 오므림, 뒷발 벌림 |
| `crouch` | 사냥 준비. 몸 낮추고 엉덩이 좌우 씰룩 |

**전환 그래프**(이 간선으로만 이동, 여러 단계면 경로를 따라 차례로 보간):
```
stand ↔ sit ↔ groom
stand ↔ loaf ↔ lieSide ↔ bellyUp
               lieSide ↔ curl
stand ↔ crouch
```
전환 시간 0.3~0.8초, ease-in-out 보간.

### 5.4 보행과 덧씌우는 동작
- **걷기**: 대각선 다리 쌍 교대, 속도에 비례한 보폭. **뛰기**: 앞 쌍·뒤 쌍이 함께 움직이는 바운드 보행.
- 회전할 때 척추가 진행 방향으로 휜다(머리 경로 히스토리를 몸이 따라감).
- 덧씌우기: 숨쉬기(항상), 골골송(몸 미세 진동 + 눈 감기), 꼬리 탁탁(귀찮음), 귀 쫑긋(자는 중 커서 반응), 머리 돌리기(커서/목적지 바라보기).

## 6. 행동 AI

### 6.1 상태
`sleep`(lieSide/curl), `loaf`, `groom`, `bellyUp`, `wander`(목적지로 걷기), `zoomies`(우다다: 짧고 빠른 연속 이동), `stalk`(crouch), `chase`(커서 쫓기), `sniff`(커서에 다가가 냄새), `purr`, `annoyed`(꼬리 탁탁 후 자리 뜸), `hide`(창 밑에 숨기), `napOnWindow`(창 위에서 자기), `summoned`(이리 와), `leaving`/`entering`(숨기기/보이기).

### 6.2 다음 행동 선택 (활동량 프리셋)
진행 중인 행동이 끝나면 아래 가중치로 다음 행동을 고른다. 표는 `presets.ts` 한 곳에 둔다.

| 행동 | 실제 고양이처럼 (기본) | 반반 | 활발하게 |
|---|---|---|---|
| 잠 | 45% · 5~20분 | 25% · 3~10분 | 10% · 1~4분 |
| 식빵 | 20% · 2~8분 | 15% · 1~5분 | 10% · 1~3분 |
| 그루밍 | 10% · 20~60초 | 15% | 15% |
| 배까기 | 5% · 20~90초 | 5% | 5% |
| 어슬렁 | 15% | 30% | 40% |
| 우다다 | 5% | 10% | 20% |

- 잠은 50% 확률로 창 위(`napOnWindow`)에서 잔다(가능한 창이 있을 때).
- 어슬렁의 30%는 숨기(`hide`)로 끝난다(가능한 창이 있을 때).
- 같은 행동이 3번 연속 나오지 않게 직전 행동의 가중치를 절반으로 낮춘다.

### 6.3 장소 선택
- 잘 곳 우선순위: 창 제목 표시줄 위(창 윗변에서 안쪽 16~40 CSS px 띠) > 화면 모서리 > Dock/작업 표시줄 근처 > 임의 위치.
- 어슬렁 목적지: 모든 모니터의 작업 영역에서 화면 가장자리 여백(몸 길이)을 둔 임의의 점. 모니터 사이 빈 공간은 그냥 지나간다(그 사이엔 안 보임).

### 6.4 커서 반응
깨어 있음 = `sleep`/`napOnWindow`가 아닌 상태.
- 깨어 있고 커서가 베르 반경 6×몸길이 안에서 600 CSS px/s 이상으로 움직이면 → `stalk` 0.5~1.5초 → `chase`. 커서가 계속 빠르면 최대 20초 쫓는다. 커서가 1초 이상 멈추면 `sniff` → 원래 행동 선택으로 복귀.
- 자는 중 커서가 반경 3×몸길이 안에서 움직이면 → 귀 쫑긋. 깰 확률(커서 움직임 1초당): 실제 고양이처럼 3%, 반반 8%, 활발하게 15%.
- 깨어 있고 커서가 반경 4×몸길이 안에 3초 이상 멈춰 있으면 → `sniff`.

### 6.5 클릭 반응
- 클릭 1회: 골골송 70% · 배까기 20%(현재 `loaf`/`lieSide`/`curl`일 때만, 아니면 골골송) · 꼬리 탁탁 10%. 골골송은 3~6초.
- 5초 안에 5번째 클릭 → `annoyed`: 꼬리 탁탁 1.5초 후 다른 곳으로 `wander`. 이후 10초간 클릭에 반응하지 않는다.
- 자는 중 클릭 → 깨면서 골골송.

### 6.6 창과의 관계
- 기본 레이어 `top`(모든 창 위).
- `napOnWindow`: 대상 창에 붙어 있음. 창이 움직이면 같은 만큼 따라 움직인다. 창이 사라지거나 최소화되면 폴짝 내려와(0.3초 점프) `top`에서 다음 행동.
- `hide`: 화면 안에 보이는 창 가장자리 중 하나를 골라 걸어가, 레이어를 `under(창)`으로 바꾸고 몸 절반쯤 안쪽으로 들어간다. 30% 확률로 얼굴만 내밀고(peek) 있다가 10~60초 뒤 나온다. 창이 움직이거나 사라지면 즉시 나온다.

### 6.7 트레이 명령
- 이리 와: 커서 위치로 `chase` 속도로 이동 → 앉아서 올려다봄 → 골골송.
- 숨기기: 가장 가까운 화면 가장자리로 걸어 나간 뒤 모든 오버레이 렌더 중지. 보이기: 임의의 가장자리에서 걸어 들어옴.

### 6.8 두뇌 인터페이스
```ts
interface BrainInput { dt: number; now: number; cursor: Vec2 | null; windows: WinInfo[]; monitors: MonitorInfo[]; clicks: number /* 이번 프레임 클릭 수 */; commands: Command[] }
interface CatState  { pos: Vec2 /* 월드 */; heading: number; pose: PoseName; gait: 'none'|'walk'|'run'; overlays: OverlayFlags; layer: Layer; eyes: number; lookAt: Vec2 | null; visible: boolean }
class Brain { constructor(rng: Rng, settings: Settings); step(input: BrainInput): CatState }
```
두뇌는 three.js·Tauri에 의존하지 않는다. 몸 길이는 `settings.bodyLengthCss`와 모니터 `cssPerWorld`로 월드 단위로 환산해 쓴다.

## 7. 창 상호작용과 클릭 처리

### 7.1 창 목록 (Rust, 10Hz)
공통 출력: `Vec<WinInfo { id: u64, rect: Rect /* 월드 */, }>`, **앞→뒤 순서**.
- macOS: `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements)`. `kCGWindowLayer == 0`, `kCGWindowAlpha > 0`, 소유 PID ≠ 자기, 너비·높이 ≥ 80×40만 남긴다. 화면 기록 권한이 필요 없다(제목은 쓰지 않음).
- Windows: `EnumWindows`(위→아래 순서). `IsWindowVisible`, `!IsIconic`, `DWMWA_CLOAKED == 0`, `WS_EX_TOOLWINDOW` 아님, 소유 PID ≠ 자기, 같은 크기 필터. 위치는 `DWMWA_EXTENDED_FRAME_BOUNDS`(보이지 않는 리사이즈 테두리 제외).
- 필터 로직은 OS 원시값을 공통 구조체로 바꾼 뒤 `window_list::filter`(순수 함수)에서 처리하고 단위 테스트한다.

### 7.2 창 밑 가리기 (마스킹)
레이어가 `under(w)`이면, 창 목록에서 `w`와 그보다 앞에 있는 창들의 사각형을 가림막으로 쓴다. 베르를 그린 뒤 가림막 사각형을 "알파 0으로 덮어쓰는" 쿼드로 그린다(`CustomBlending`, src·dst 모두 `ZeroFactor`). 레이어가 `top`이면 가림막이 없다.

### 7.3 클릭 통과 전환
- 오버레이 창은 기본적으로 `setIgnoreCursorEvents(true)`.
- 각 웹뷰는 커서 이벤트를 받을 때마다 커서가 (1) 자기 모니터 안이고 (2) 베르 히트 영역(몸통+머리를 화면에 투영한 타원들을 8 CSS px 넓힌 것) 안이며 (3) 그 지점이 가림막에 가려지지 않았는지 판정한다(`hit.ts`, 순수 함수 + 테스트). 참이면 `false`로 바꾸고, 거짓이 되면 다시 `true`로 바꾼다. 상태가 바뀔 때만 호출한다.
- 클릭은 캔버스의 `pointerdown`으로 받아 brain 웹뷰로 `cat-click` 이벤트를 보낸다.
- 포커스: Windows는 오버레이에 `WS_EX_NOACTIVATE`를 설정해 클릭해도 다른 앱 포커스를 뺏지 않는다. macOS는 V1에서 클릭 시 베르로 포커스가 넘어가는 것을 허용한다(개선 경로: `NSPanel` + `nonactivatingPanel`).

### 7.4 오버레이 창 설정
투명, 테두리 없음, 그림자 없음, 항상 위(`alwaysOnTop`), 작업 표시줄/Dock 미표시, 모든 Space/가상 데스크톱에 표시, 크기 조절 불가, 포커스 불가. macOS 앱은 `ActivationPolicy::Accessory`(Dock에 안 보이는 `LSUIElement`와 같은 효과). 투명 창을 위해 `macOSPrivateApi: true`.

## 8. 성능
- **프레임 조절**: 이동·전환 중 60fps, 쉬는 자세(잠·식빵·배까기)에서는 숨쉬기만 있으므로 15fps, 숨김 상태와 베르가 없는 모니터는 렌더 중지.
- **scissor**: 베르의 화면상 바운딩 박스(+여백)만 지우고 그린다. 캔버스는 모니터 크기지만 실제 픽셀 작업은 베르 주변만.
- devicePixelRatio는 최대 2.
- 목표: 쉬는 중 CPU 5% 미만(Apple Silicon 기준, 활성 상태 모니터로 측정).

## 9. 배포

### 9.1 빌드 (GitHub Actions, `v*` 태그 푸시 시)
- macOS: `macos-latest`에서 `--target universal-apple-darwin` 빌드. ad-hoc 서명(`bundle.macOS.signingIdentity: "-"`). `Ber.app`을 `ditto -c -k --keepParent`로 `Ber-<버전>-mac.zip`.
- Windows: `windows-latest`에서 x64 빌드. 실행 파일 `ber.exe`를 `Ber-<버전>-windows-x64.zip`으로 묶는다(WebView2는 Windows 10/11에 기본 포함).
- 두 zip과 SHA-256을 GitHub Release에 업로드.
- 모든 푸시/PR에서: 타입체크, vitest, `cargo test`, 양쪽 OS 빌드 확인.

### 9.2 설치 채널
- **Homebrew tap** `LeeKwang-min/homebrew-tap`의 `Casks/ber.rb`: zip 다운로드, `app "Ber.app"`, `postflight`에서 `xattr -dr com.apple.quarantine`, `uninstall quit:`, `zap trash:`.
- **Scoop bucket** `LeeKwang-min/scoop-bucket`의 `bucket/ber.json`: zip 다운로드, `shortcuts: [["ber.exe", "베르"]]`, `checkver`/`autoupdate`는 GitHub 릴리스 기준. Scoop은 PowerShell로 다운로드하므로 Mark-of-the-Web이 붙지 않아 SmartScreen 경고가 뜨지 않는다.
- 로그인 시 실행(`tauri-plugin-autostart`)은 Scoop의 `current` 경로를 쓰므로 업데이트 후에도 유지된다.

### 9.3 릴리스 절차 (V1은 수동 스크립트)
`scripts/release.sh <버전>`: 버전 갱신 → 태그 푸시 → CI 완료 후 릴리스 zip의 SHA-256으로 cask와 Scoop manifest를 갱신해 두 레포에 커밋. 자동화(PAT로 CI에서 직접 갱신)는 필요해지면 추가.

### 9.4 가족용 설치 안내 (README, 한국어)
- macOS: Homebrew 설치 → `brew install --cask leekwang-min/tap/ber`.
- Windows: PowerShell에서 Scoop 설치 2줄 → `scoop bucket add ber https://github.com/LeeKwang-min/scoop-bucket` → `scoop install ber`.
- 업데이트·삭제 명령, 트레이 메뉴 설명.

## 10. 에러 처리
| 상황 | 처리 |
|---|---|
| 창 목록 조회 실패 | 빈 목록으로 취급. 베르는 `top` 레이어에서 계속 동작. 실패는 로그만. |
| 모니터 구성 변경 | 오버레이 재생성, brain 역할 재결정, 베르가 사라진 모니터에 있었다면 주 모니터 중앙 근처로 이동. |
| WebGL 컨텍스트 손실 | 해당 웹뷰 새로고침(`location.reload()`). brain 웹뷰는 상태가 초기화되어도 무방. |
| 설정 저장소 손상/없음 | 기본값 사용 후 덮어씀. |
| 커서 위치 조회 실패 | `cursor: null`로 전달. 커서 반응만 꺼짐. |
| brain 웹뷰 응답 없음(2초 이상 `cat-state` 없음) | 뷰어 웹뷰는 마지막 상태로 정지. 재생성은 모니터 변경 시에만. |

## 11. 테스트 전략
- **TS 단위 테스트 (vitest)**: 두뇌(시드 고정 RNG로 활동량별 분포, 클릭 연타 → `annoyed`, 자는 중 커서 반응, 창 위에서 자다가 창 이동 시 따라감, 창 사라짐 → 내려옴), 좌표 변환, 히트 판정, 자세 전환 경로 탐색.
- **Rust 단위 테스트**: `window_list::filter`, 좌표 변환.
- **시각 확인**: 개발용 자세 갤러리(`?gallery`)에서 모든 자세와 전환을 눈으로 확인.
- **수동 확인 체크리스트**: 클릭 통과, 베르 클릭, 창 위에서 자기/창 이동 따라가기, 창 밑 숨기, 두 모니터 오가기, 트레이 메뉴 전 항목, 로그인 시 실행, CPU 측정.
- **Windows 확인**: CI 빌드 산출물을 가족 PC 또는 Windows 환경에서 체크리스트로 확인.

## 12. 마일스톤
1. **뼈대**: Tauri 프로젝트, 모니터별 투명 오버레이, 클릭 통과, 시안 베르를 정지 상태로 렌더 (macOS)
2. **모델·자세**: 스키닝 몸통, 2마디 다리, 눈꺼풀, 8개 자세, 전환 그래프, 보행, 자세 갤러리
3. **두뇌**: 상태 머신, 활동량 프리셋, 어슬렁/잠/식빵/그루밍/배까기/우다다, 상태 방송, 여러 모니터
4. **상호작용**: 커서 반응, 히트 판정과 클릭 반응, 트레이 메뉴 전체, 설정 저장, 로그인 시 실행
5. **창**: macOS 창 목록, 창 위에서 자기, 창 밑 숨기와 마스킹
6. **Windows**: 창 목록(Windows), 좌표/DPI, `WS_EX_NOACTIVATE`, CI 양쪽 빌드
7. **배포**: 릴리스 워크플로, brew tap·Scoop bucket 레포, 설치 안내, 첫 릴리스 *(외부 공개 작업이므로 진행 전 사용자 확인)*

## 13. 알려진 한계와 이후 확장
- macOS에서 베르를 클릭하면 포커스가 베르로 넘어간다 → `NSPanel` 전환으로 개선 가능.
- macOS 전체화면 앱(영상 등) 위에서는 베르가 안 보일 수 있다(의도적으로 허용).
- 공증·코드 서명 없음 → 공개 배포 시 SignPath Foundation(오픈소스 무료 서명) 신청 검토.
- 릴리스 후 cask/manifest 갱신은 수동 스크립트 → 필요 시 CI 자동화.
- 다른 고양이 추가는 `cat/params.ts`에 프리셋을 늘리는 방식으로 확장 가능(V1은 베르 하나).
