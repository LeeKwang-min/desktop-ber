# 계획 B: 커서·클릭·트레이 상호작용 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 베르가 커서를 상황에 따라 쫓거나 무시하고, 클릭(쓰다듬기)에 기분 따라 반응하며, 트레이 메뉴(이리 와·숨기기/보이기·활동량·크기·로그인 시 실행·종료)와 설정 저장이 동작한다 (macOS).

**Architecture:** 계획 A 위에 올린다. 상태 타입을 `src/state.ts` 한 곳으로 모으고, 두뇌(`brain.ts`)에 커서·클릭·명령 반응을 넣는다. Rust는 설정(`tauri-plugin-store`)·자동 실행(`tauri-plugin-autostart`)·트레이를 맡아 `command` 이벤트로 두뇌에 전달한다. 각 웹뷰는 three.js 레이캐스트로 커서가 베르 위인지 판정해, 그때만 클릭 통과를 끈다.

**Tech Stack:** Tauri 2.12 (+ tauri-plugin-store 2, tauri-plugin-autostart 2), TypeScript, three.js 0.186, vitest

**Spec:** `docs/superpowers/specs/2026-10-16-ber-desktop-cat-design.md` (§6.4 커서, §6.5 클릭, §6.7 트레이, §7.3 클릭 통과, §10 에러 처리)

**계획 시리즈:** A(완료) → **B(이 문서)** → C(창 위에서 자기·창 밑 숨기·마스킹) → D(Windows·배포)

## Global Constraints

- 계획 A의 Global Constraints 전부 유지 (Tauri 2.x, 순수 TS 모듈 규칙, 외형 파라미터, 38° 직교 카메라, 한국어 UI, 커밋 형식).
- 몸 길이(CSS px): 작게 90 / 보통 130 / 크게 180 (`SIZE_CSS`).
- 커서 반응 수치(spec §6.4): 쫓기 반경 6 몸길이·속도 600 CSS px/s 이상, 최대 20초, 커서가 1초 이상 멈추면 냄새 맡기, 자는 중 반경 3 몸길이에서 귀 쫑긋, 깰 확률/초 = 프리셋 `wakeOnCursorPerSec`, 멈춘 커서 반경 4 몸길이·3초 → 냄새 맡기.
- 클릭 반응 수치(spec §6.5): 골골송 70%·배까기 20%(누운 자세일 때만)·꼬리 탁탁 10%, 골골송 3~6초, 5초 안 5번째 클릭 → 귀찮음(꼬리 탁탁 1.5초 후 자리 뜸) + 10초간 클릭 무시, 자는 중 클릭 → 깨며 골골송.
- 트레이 문구: "이리 와", "숨기기"/"보이기", "활동량" ▸ "실제 고양이처럼"/"반반"/"활발하게", "크기" ▸ "작게"/"보통"/"크게", "로그인 시 실행", "종료".
- 로그인 시 실행 토글은 개발 빌드에서 누르지 않는다(디버그 바이너리 경로가 LaunchAgent로 등록됨). 실제 확인은 계획 D의 릴리스 빌드에서.

## Review Focus

1. **커서가 베르 위에 있는 채로 베르가 움직임** → 클릭 통과 상태가 커서 이벤트 없이도 갱신돼야 한다(멈춘 커서 밑으로 베르가 걸어오면 클릭 가능, 떠나면 통과). Task 5에서 매 프레임 재판정.
2. **연타 직후 계속 클릭** → 귀찮음 이후 10초 동안 반응하지 않아야 하고 그 뒤엔 다시 반응해야 한다. Task 3 테스트로 고정.
3. **커서를 오래 가만히 둔 채 베르가 근처를 지나감** → 냄새 맡기는 커서가 멈춘 한 번에 한 번만. 커서 주위를 맴돌면 안 된다. Task 3 테스트로 고정.
4. **숨긴 상태로 앱 재시작 / 모니터 재구성** → 숨김이 유지되고, 다시 보이기 전까지 커서·클릭에 반응하지 않아야 한다. Task 2(설정 저장)·Task 3(테스트).
5. **설정 파일이 없거나 깨짐** → 기본값(실제 고양이처럼·보통·보이기)으로 동작. Task 2 Rust 테스트로 고정.

---

## File Structure

```
src/
├─ state.ts                 (신규) CatState·Gait·Overlays·Layer·Command·NO_OVERLAYS — 두뇌와 렌더러가 공유
├─ camera.ts                (신규) makeCamera·frameCamera·placeRoot — WebGL 없이 테스트 가능한 카메라·배치 수학
├─ hit.ts (+ hit.test.ts)   (신규) 레이캐스트 히트 판정
├─ bridge.ts                getSettings·TrayCommand·onCommand·sendClick·onClick 추가
├─ overlay.ts               설정·명령·클릭·클릭 통과·시선·스냅샷 연결, 모니터 불일치 시 종료
├─ render.ts                camera.ts 사용, hitTest() 추가
├─ gallery.ts               import 경로만 변경
├─ brain/brain.ts (+ test)  커서·클릭·명령 반응, 스냅샷 복원, bodyLengthCss
└─ cat/animator.ts (+ test) 타입은 state.ts에서, lookYaw 방향 규칙 고정
src-tauri/
├─ Cargo.toml               store·autostart 플러그인, image-png
├─ src/settings.rs          (신규) 설정 타입·불러오기·저장 (+ 테스트)
├─ src/tray.rs              전체 메뉴
├─ src/lib.rs               플러그인 등록, 설정 상태, get_settings
├─ src/overlay.rs           실패해도 창마다 계속 (로그)
└─ icons/tray.png           (생성물) 메뉴바 템플릿 아이콘
scripts/make-icon.mjs       트레이 아이콘도 생성
```

---

### Task 1: 공용 상태 타입과 재구성 견고성

**Files:**
- Create: `src/state.ts`
- Modify: `src/brain/brain.ts` (타입 블록 → state.ts import, `bodyLengthCss`), `src/cat/animator.ts` (타입 → state.ts), `src/gallery.ts`, `src/cat/animator.test.ts` (import 경로), `src/overlay.ts` (모니터 불일치 시 종료, `state.bodyLengthCss` 사용)
- Modify: `src-tauri/src/overlay.rs` (`rebuild`가 실패를 로그하고 계속), `src-tauri/src/lib.rs`, `src-tauri/src/poller.rs` (호출부)
- Test: `src/brain/brain.test.ts`

**Interfaces:**
- Produces: `src/state.ts` — `type Gait`, `interface Overlays`, `NO_OVERLAYS`, `type Layer`, `interface CatState {…; bodyLengthCss: number}`, `type Command`. `brain.ts`는 이 타입들을 re-export한다(`export type { CatState, Command, Gait, Layer, Overlays } from '../state'`). Rust `overlay::rebuild(app: &AppHandle)` (반환값 없음).

- [ ] **Step 1: 실패하는 테스트 작성** — `src/brain/brain.test.ts`의 `describe('Brain', …)` 마지막에 추가:
```ts
  it('reports body length in its state and follows setSize', () => {
    const b = new Brain(mulberry32(10), settings(), [main]);
    expect(b.step(input([main])).bodyLengthCss).toBe(130);
    expect(b.step({ ...input([main]), commands: [{ type: 'setSize', bodyLengthCss: 180 }] }).bodyLengthCss).toBe(180);
  });
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/brain/brain.test.ts` / Expected: FAIL — `expected undefined to be 130`

- [ ] **Step 3: `src/state.ts` 작성**
```ts
// 두뇌가 만들고 렌더러가 소비하는 상태 타입. 두 쪽이 같은 정의를 쓰도록 한 곳에 둔다 (순수 TS).
import type { Vec2 } from './world';
import type { PoseName } from './cat/graph';
import type { Activity } from './brain/presets';

export type Gait = 'none' | 'walk' | 'run';
export interface Overlays { purr: boolean; tailThump: boolean; earTwitch: boolean }
export const NO_OVERLAYS: Overlays = { purr: false, tailThump: false, earTwitch: false };
export type Layer = { kind: 'top' } | { kind: 'under'; windowId: number };

export interface CatState {
  pos: Vec2;            // 월드 좌표
  heading: number;      // 화면 기준 라디안 (y 아래로)
  pose: PoseName;       // 목표 자세
  gait: Gait;
  speed: number;        // 몸길이/초
  overlays: Overlays;
  layer: Layer;
  lookAt: Vec2 | null;  // 바라볼 점 (월드)
  visible: boolean;
  behavior: string;
  bodyLengthCss: number;
}

export type Command =
  | { type: 'summon' } | { type: 'hide' } | { type: 'show' }
  | { type: 'setActivity'; activity: Activity }
  | { type: 'setSize'; bodyLengthCss: number };
```

- [ ] **Step 4: 기존 파일을 state.ts로 옮기기**
  - `src/brain/brain.ts`: `export type Gait = …`부터 `export type Command = …;`까지의 타입 블록(Gait·Overlays·Layer·CatState·Command)을 지우고 그 자리에
    ```ts
    import { NO_OVERLAYS, type CatState, type Command, type Overlays } from '../state';
    export type { CatState, Command, Gait, Layer, Overlays } from '../state';
    ```
    `const noOverlays = (): Overlays => ({ purr: false, tailThump: false, earTwitch: false });`를 `const noOverlays = (): Overlays => ({ ...NO_OVERLAYS });`로. 생성자의 상태 초기값에 `bodyLengthCss: settings.bodyLengthCss,`를 추가하고, `step()`에서 명령 처리(`for (const c of input.commands) this.handle(c);`) 바로 다음 줄에 `this.s.bodyLengthCss = this.settings.bodyLengthCss;`를 추가.
  - `src/cat/animator.ts`: `export type Gait …`, `export interface Overlays …`, `export const NO_OVERLAYS …` 세 줄을 지우고 `import type { Gait, Overlays } from '../state';`를 import 블록에 추가. (`AnimInput`은 그대로)
  - `src/gallery.ts`: `import { Animator, NO_OVERLAYS, type Gait } from './cat/animator';` → `import { Animator } from './cat/animator';` + `import { NO_OVERLAYS, type Gait } from './state';`
  - `src/cat/animator.test.ts`: `import { Animator, NO_OVERLAYS } from './animator';` → `import { Animator } from './animator';` + `import { NO_OVERLAYS } from '../state';`
  - `src/overlay.ts`: `const base = monitors.find((m) => m.id === bridge.monitorId) ?? monitors[0];`를 아래로 교체하고, `view.place(…, settings.bodyLengthCss)`를 `view.place(…, state.bodyLengthCss)`로:
    ```ts
    const base = monitors.find((m) => m.id === bridge.monitorId);
    if (!base) {
      // 모니터 구성이 바뀌는 중에 뜬 창: 곧 다시 만들어지므로 아무것도 하지 않는다 (두뇌가 둘 생기는 것 방지)
      bridge.log(`overlay: monitor ${bridge.monitorId} not in [${monitors.map((m) => m.id).join(',')}]`);
      return;
    }
    ```

- [ ] **Step 5: Rust 재구성이 실패해도 계속하게** — `src-tauri/src/overlay.rs`의 `rebuild`를 교체:
```rust
/// 기존 오버레이를 모두 닫고 현재 모니터마다 하나씩 다시 만든다.
/// 한 창이 실패해도 나머지는 계속 만든다 (실패는 터미널에 남긴다).
pub fn rebuild(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("overlay-") {
            if let Err(e) = w.destroy() {
                eprintln!("overlay destroy {label}: {e}");
            }
        }
    }
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst);
    for (i, m) in platform::monitors(app).iter().enumerate() {
        let label = format!("overlay-{gen}-{i}");
        if let Err(e) = create(app, &label, m) {
            eprintln!("overlay create {label}: {e}");
        }
    }
}
```
  `src-tauri/src/lib.rs`의 `overlay::rebuild(app.handle())?;` → `overlay::rebuild(app.handle());`, `src-tauri/src/poller.rs`의 `let _ = overlay::rebuild(&handle);` → `overlay::rebuild(&handle);`

- [ ] **Step 6: 통과 확인** — Run: `pnpm test && pnpm typecheck && (cd src-tauri && cargo test)` / Expected: 34 tests PASS, 타입 오류 없음, cargo 2 passed

- [ ] **Step 7: 커밋**
```bash
git add -A
git commit -m "refactor: share cat state types and harden overlay rebuilds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 설정·트레이·자동 실행 (Rust)

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/tray.rs` (전체 교체), `scripts/make-icon.mjs` (전체 교체), `src/bridge.ts`
- Create: `src-tauri/src/settings.rs`, `src-tauri/icons/tray.png` (생성물)

**Interfaces:**
- Consumes: Task 1 `Command`
- Produces:
  - Rust `settings::{Settings {activity, size, visible}, Activity, Size, load(app), save(app, &s)}`; 명령 `get_settings() -> {activity: "calm"|"balanced"|"active", size: "small"|"normal"|"large", visible: bool}`
  - 이벤트 `command` (payload: `{type:"summon"}` | `{type:"hide"}` | `{type:"show"}` | `{type:"setActivity",activity}` | `{type:"setSize",size}`)
  - `bridge.ts`: `type TrayCommand`, `interface RustSettings`, `getSettings()`, `onCommand(cb: (c: TrayCommand) => void)`, `sendClick()`, `onClick(cb)`

- [ ] **Step 1: 의존성 추가** — `src-tauri/Cargo.toml`의 `[dependencies]`를:
```toml
tauri = { version = "2", features = ["tray-icon", "image-png", "macos-private-api"] }
tauri-plugin-store = "2"
tauri-plugin-autostart = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: 실패하는 설정 테스트와 함께 `src-tauri/src/settings.rs` 작성 (테스트 먼저, `from_json`은 `unimplemented!()`)**
```rust
// 트레이에서 바꾸는 설정. tauri-plugin-store의 settings.json에 저장한다.
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Activity {
    Calm,
    Balanced,
    Active,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Size {
    Small,
    Normal,
    Large,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub activity: Activity,
    pub size: Size,
    pub visible: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { activity: Activity::Calm, size: Size::Normal, visible: true }
    }
}

impl Settings {
    /// 저장된 값이 없거나 깨졌으면 기본값 (spec §10)
    pub fn from_json(_v: Option<serde_json::Value>) -> Self {
        unimplemented!()
    }
}

const STORE: &str = "settings.json";
const KEY: &str = "settings";

pub fn load(app: &AppHandle) -> Settings {
    app.store(STORE).map(|s| Settings::from_json(s.get(KEY))).unwrap_or_default()
}

pub fn save(app: &AppHandle, s: &Settings) {
    match app.store(STORE) {
        Ok(store) => {
            store.set(KEY, serde_json::to_value(s).unwrap_or_default());
            if let Err(e) = store.save() {
                eprintln!("settings save: {e}");
            }
        }
        Err(e) => eprintln!("settings store: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn falls_back_to_defaults_for_missing_or_broken_values() {
        assert_eq!(Settings::from_json(None), Settings::default());
        assert_eq!(Settings::from_json(Some(json!("garbage"))), Settings::default());
        let partial = Settings::from_json(Some(json!({ "activity": "active" })));
        assert_eq!(partial, Settings { activity: Activity::Active, ..Settings::default() });
    }

    #[test]
    fn serializes_with_the_names_the_webview_uses() {
        assert_eq!(serde_json::to_value(Settings::default()).unwrap(), json!({ "activity": "calm", "size": "normal", "visible": true }));
    }
}
```
  `src-tauri/src/lib.rs` 맨 위 mod 목록에 `mod settings;` 추가.

- [ ] **Step 3: 실패 확인** — Run: `(cd src-tauri && cargo test settings)` / Expected: `falls_back_to_defaults…` FAILED (`not implemented`)

- [ ] **Step 4: `from_json` 구현**
```rust
    pub fn from_json(v: Option<serde_json::Value>) -> Self {
        v.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
    }
```
  Run: `(cd src-tauri && cargo test settings)` / Expected: 2 passed

- [ ] **Step 5: 트레이 아이콘 생성기 확장** — `scripts/make-icon.mjs` 전체 교체 (앱 아이콘 + 메뉴바 템플릿 아이콘):
```js
// 베르 얼굴 아이콘을 그린다. 외부 의존성 없음.
//  - assets/app-icon.png (1024, 컬러, tauri icon 입력)
//  - src-tauri/icons/tray.png (44 = 22pt@2x, 메뉴바 템플릿: 검은 실루엣 + 투명한 눈)
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FUR = [35, 37, 43], WHITE = [244, 243, 238], IRIS = [197, 214, 61], PUPIL = [12, 12, 14], SHINE = [255, 255, 255], BLACK = [0, 0, 0];
const CLEAR = 'clear';

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inTri = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const ears = (x, y) => inTri(x, y, [250, 420], [330, 120], [470, 330]) || inTri(x, y, [774, 420], [694, 120], [554, 330]);
const head = (x, y) => inEllipse(x, y, 512, 560, 360, 320);
const eyes = (x, y) => inEllipse(x, y, 380, 540, 70, 76) || inEllipse(x, y, 644, 540, 70, 76);

// 모양 좌표는 1024 기준. 배열 뒤쪽이 위에 그려진다. CLEAR는 그 자리를 투명하게 뚫는다.
const FACE = [
  [FUR, ears], [FUR, head],
  [WHITE, (x, y) => inEllipse(x, y, 512, 760, 120, 80)],
  [WHITE, (x, y) => inEllipse(x, y, 450, 700, 80, 62) || inEllipse(x, y, 574, 700, 80, 62)],
  [FUR, (x, y) => inEllipse(x, y, 512, 668, 34, 24)],
  [IRIS, eyes],
  [PUPIL, (x, y) => inEllipse(x, y, 380, 548, 28, 62) || inEllipse(x, y, 644, 548, 28, 62)],
  [SHINE, (x, y) => inEllipse(x, y, 402, 508, 16, 16) || inEllipse(x, y, 666, 508, 16, 16)],
];
const SILHOUETTE = [[BLACK, ears], [BLACK, head], [CLEAR, eyes]];

function draw(S, layers, SS = 4) {
  const px = Buffer.alloc(S * S * 4), k = 1024 / S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = (x + (sx + 0.5) / SS) * k, fy = (y + (sy + 0.5) / SS) * k;
      let col = null;
      for (const [c, hit] of layers) if (hit(fx, fy)) col = c;
      if (col && col !== CLEAR) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
    }
    const i = (y * S + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
    px[i + 3] = Math.round((a / (SS * SS)) * 255);
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function writePng(path, S, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log('wrote', path);
}

mkdirSync('assets', { recursive: true });
writePng('assets/app-icon.png', 1024, draw(1024, FACE));
writePng('src-tauri/icons/tray.png', 44, draw(44, SILHOUETTE, 8));
```
  Run: `node scripts/make-icon.mjs` / Expected: `wrote assets/app-icon.png`, `wrote src-tauri/icons/tray.png` (`tauri icon`은 다시 돌리지 않는다)

- [ ] **Step 6: 트레이 전체 메뉴** — `src-tauri/src/tray.rs` 전체 교체:
```rust
// 메뉴바(트레이) 메뉴. 선택은 settings에 저장하고 "command" 이벤트로 두뇌 웹뷰에 알린다.
use crate::settings::{self, Activity, Settings, Size};
use serde_json::json;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt;

const ACTIVITIES: [(Activity, &str, &str); 3] = [
    (Activity::Calm, "act-calm", "실제 고양이처럼"),
    (Activity::Balanced, "act-balanced", "반반"),
    (Activity::Active, "act-active", "활발하게"),
];
const SIZES: [(Size, &str, &str); 3] = [(Size::Small, "size-small", "작게"), (Size::Normal, "size-normal", "보통"), (Size::Large, "size-large", "크게")];

/// 메뉴 이벤트에서 체크 표시·문구를 바꾸려고 들고 있는 항목들
struct TrayItems {
    visible: MenuItem<Wry>,
    activity: Vec<CheckMenuItem<Wry>>,
    size: Vec<CheckMenuItem<Wry>>,
    autostart: CheckMenuItem<Wry>,
}

fn visible_label(visible: bool) -> &'static str {
    if visible { "숨기기" } else { "보이기" }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let s = *app.state::<Mutex<Settings>>().lock().unwrap();
    let summon = MenuItem::with_id(app, "summon", "이리 와", true, None::<&str>)?;
    let visible = MenuItem::with_id(app, "visible", visible_label(s.visible), true, None::<&str>)?;
    let activity = ACTIVITIES
        .iter()
        .map(|(a, id, label)| CheckMenuItem::with_id(app, *id, *label, true, s.activity == *a, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let size = SIZES
        .iter()
        .map(|(z, id, label)| CheckMenuItem::with_id(app, *id, *label, true, s.size == *z, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "로그인 시 실행", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let act_refs: Vec<&dyn IsMenuItem<Wry>> = activity.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
    let size_refs: Vec<&dyn IsMenuItem<Wry>> = size.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
    let activity_menu = Submenu::with_items(app, "활동량", true, &act_refs)?;
    let size_menu = Submenu::with_items(app, "크기", true, &size_refs)?;
    let (sep1, sep2) = (PredefinedMenuItem::separator(app)?, PredefinedMenuItem::separator(app)?);
    let menu = Menu::with_items(app, &[&summon, &visible, &sep1, &activity_menu, &size_menu, &autostart, &sep2, &quit])?;
    app.manage(TrayItems { visible, activity, size, autostart });

    let mut tray = TrayIconBuilder::with_id("ber").tooltip("베르").menu(&menu).on_menu_event(on_menu);
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn on_menu(app: &AppHandle, e: MenuEvent) {
    let id = e.id().as_ref();
    if id == "quit" {
        app.exit(0);
        return;
    }
    if id == "summon" {
        let _ = app.emit("command", json!({ "type": "summon" }));
        return;
    }
    let items = app.state::<TrayItems>();
    if id == "autostart" {
        let al = app.autolaunch();
        let result = if al.is_enabled().unwrap_or(false) { al.disable() } else { al.enable() };
        if let Err(e) = result {
            eprintln!("autostart: {e}");
        }
        let _ = items.autostart.set_checked(al.is_enabled().unwrap_or(false));
        return;
    }
    let state = app.state::<Mutex<Settings>>();
    let mut s = state.lock().unwrap();
    if id == "visible" {
        s.visible = !s.visible;
        let _ = items.visible.set_text(visible_label(s.visible));
        let _ = app.emit("command", json!({ "type": if s.visible { "show" } else { "hide" } }));
    } else if let Some((a, _, _)) = ACTIVITIES.iter().find(|(_, i, _)| *i == id) {
        s.activity = *a;
        let _ = app.emit("command", json!({ "type": "setActivity", "activity": a }));
    } else if let Some((z, _, _)) = SIZES.iter().find(|(_, i, _)| *i == id) {
        s.size = *z;
        let _ = app.emit("command", json!({ "type": "setSize", "size": z }));
    }
    // 체크 메뉴는 macOS가 누른 항목을 토글하므로, 선택 상태를 항상 설정값으로 다시 맞춘다
    for (item, (a, _, _)) in items.activity.iter().zip(ACTIVITIES.iter()) {
        let _ = item.set_checked(s.activity == *a);
    }
    for (item, (z, _, _)) in items.size.iter().zip(SIZES.iter()) {
        let _ = item.set_checked(s.size == *z);
    }
    settings::save(app, &s);
}
```

- [ ] **Step 7: 앱 셋업에 플러그인·설정 연결** — `src-tauri/src/lib.rs`를:
```rust
mod geometry;
mod overlay;
mod platform;
mod poller;
mod settings;
mod tray;

use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent, State};

#[tauri::command]
fn get_monitors(app: AppHandle) -> Vec<geometry::MonitorInfo> {
    platform::monitors(&app)
}

#[tauri::command]
fn get_settings(state: State<Mutex<settings::Settings>>) -> settings::Settings {
    *state.lock().unwrap()
}

/// 웹뷰의 로그·오류를 터미널(stderr)로 보낸다. 웹뷰 콘솔은 밖에서 볼 수 없어서 필요하다.
#[tauri::command]
fn log(window: tauri::Window, msg: String) {
    eprintln!("[{}] {msg}", window.label());
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![get_monitors, get_settings, log])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            app.manage(Mutex::new(settings::load(app.handle())));
            tray::build(app.handle())?;
            overlay::rebuild(app.handle());
            poller::start(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Ber")
        .run(|_app, event| {
            // 오버레이를 다시 만들 때 창이 0개가 되어도 앱은 계속 산다. 트레이 "종료"(code: Some)만 종료.
            if let RunEvent::ExitRequested { api, code: None, .. } = event {
                api.prevent_exit();
            }
        });
}
```
  Run: `(cd src-tauri && cargo test)` / Expected: 컴파일 성공, 4 passed (geometry 1, poller 1, settings 2). API 이름 불일치로 컴파일이 안 되면 docs.rs의 tauri 2.12 / tauri-plugin-store 2 / tauri-plugin-autostart 2 문서로 정확한 이름을 확인해 고친다.

- [ ] **Step 8: bridge에 설정·명령·클릭 추가** — `src/bridge.ts`에서 기존 `onCommand` 줄을 지우고, import와 객체 항목을 추가:
```ts
import type { Activity, SizeName } from './brain/presets';

export type TrayCommand =
  | { type: 'summon' } | { type: 'hide' } | { type: 'show' }
  | { type: 'setActivity'; activity: Activity }
  | { type: 'setSize'; size: SizeName };
export interface RustSettings { activity: Activity; size: SizeName; visible: boolean }
```
```ts
  getSettings: () => invoke<RustSettings>('get_settings'),
  onCommand: (cb: (c: TrayCommand) => void): Promise<UnlistenFn> => listen<TrayCommand>('command', (e) => cb(e.payload)),
  sendClick: (): Promise<void> => emit('cat-click'),
  onClick: (cb: () => void): Promise<UnlistenFn> => listen('cat-click', () => cb()),
```
  Run: `pnpm typecheck && pnpm test` / Expected: 오류 없음, 34 PASS

- [ ] **Step 9: 커밋**
```bash
git add -A
git commit -m "feat: add tray menu with persisted settings and launch-at-login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 두뇌의 커서·클릭·명령 반응

**Files:**
- Modify: `src/brain/brain.ts` (전체 교체)
- Test: `src/brain/brain.test.ts` (반응 테스트 추가)

**Interfaces:**
- Consumes: Task 1 `state.ts`, 계획 A의 world/rng/presets/graph
- Produces: `Brain { constructor(rng, settings, monitors, opts?: BrainOptions); state; step(input): CatState; walkTo(to, run?) }`, `interface Snapshot {pos; heading; pose}`, `interface BrainOptions {restore?: Snapshot | null; hidden?: boolean}`, `angleDiff`, `approachAngle`, `STALE_SEC`, `staleSafe`. 행동 이름(`state.behavior`): `loaf, sleep, groom, bellyUp, wander, zoomies, stalk, chase, sniff, purr, tailThump, annoyed, summoned, leaving, hidden, entering`.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/brain/brain.test.ts` 맨 위 import에 `dist`를 추가(`import { dist, rectContains, type MonitorInfo, type Vec2 } from '../world';`)하고, 파일 끝에 추가:
```ts
describe('Brain reactions', () => {
  const step = (b: Brain, opts: Partial<BrainInput> = {}) => b.step({ ...input([main]), ...opts });
  const wiggle = (p: Vec2, t: number, amp = 200, freq = 5) => ({ x: p.x + 200 + Math.sin(t * freq) * amp, y: p.y - 150 });
  const untilSleeping = (b: Brain) => {
    for (let i = 0; i < 30 * 60 * 15; i++) {
      const s = b.step(input([main], 1 / 15));
      if (s.behavior === 'sleep' && s.gait === 'none' && (s.pose === 'curl' || s.pose === 'lieSide')) return true;
    }
    return false;
  };

  it('stalks and then chases a fast-moving cursor', () => {
    const b = new Brain(mulberry32(21), settings('active'), [main]);
    const p0 = { ...b.state.pos }, seen = new Set<string>();
    for (let t = 0; t < 4; t += 1 / 60) seen.add(step(b, { dt: 1 / 60, cursor: wiggle(p0, t) }).behavior);
    expect(seen.has('stalk')).toBe(true);
    expect(seen.has('chase')).toBe(true);
  });

  it('stops chasing and sniffs once the cursor stops', () => {
    const b = new Brain(mulberry32(22), settings('active'), [main]);
    const p0 = { ...b.state.pos };
    let t = 0;
    for (; t < 4; t += 1 / 60) step(b, { dt: 1 / 60, cursor: wiggle(p0, t) });
    const still = wiggle(p0, t);
    let closest = Infinity, sniffed = false;
    for (let u = 0; u < 6; u += 1 / 60) {
      const s = step(b, { dt: 1 / 60, cursor: still });
      if (s.behavior === 'sniff') { sniffed = true; closest = Math.min(closest, dist(s.pos, still)); }
    }
    expect(sniffed).toBe(true);
    expect(closest).toBeLessThan(130 * 1.5);
  });

  it('sniffs a cursor resting nearby only once per resting episode (Review Focus 3)', () => {
    const b = new Brain(mulberry32(29), settings(), [main]);
    const cursor = { x: b.state.pos.x + 200, y: b.state.pos.y };
    let episodes = 0, prev = '';
    for (let t = 0; t < 40; t += 1 / 30) {
      const s = step(b, { cursor });
      if (s.behavior === 'sniff' && prev !== 'sniff') episodes++;
      prev = s.behavior;
    }
    expect(episodes).toBe(1);
  });

  it('twitches its ears at a cursor moving nearby while asleep, and an active cat wakes up', () => {
    const b = new Brain(mulberry32(8), settings('calm'), [main]);
    expect(untilSleeping(b)).toBe(true);
    const p = { ...b.state.pos };
    const near = (t: number) => ({ x: p.x + 100 + Math.sin(t * 8) * 80, y: p.y });
    let twitched = false;
    for (let t = 0; t < 1; t += 1 / 30) twitched ||= step(b, { cursor: near(t) }).overlays.earTwitch;
    expect(twitched).toBe(true);
    step(b, { commands: [{ type: 'setActivity', activity: 'active' }] });
    let woke = false;
    for (let t = 0; t < 60 && !woke; t += 1 / 30) woke = step(b, { cursor: near(t) }).behavior !== 'sleep';
    expect(woke).toBe(true);
  });

  it('reacts to a single click mostly by purring (spec §6.5 proportions)', () => {
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 300; seed++) {
      const b = new Brain(mulberry32(seed), settings(), [main]); // 시작은 식빵(누운 자세)
      step(b, { clicks: 1 });
      const s = step(b);
      counts[s.behavior] = (counts[s.behavior] ?? 0) + 1;
    }
    expect((counts.purr ?? 0) / 300).toBeGreaterThan(0.6);
    expect((counts.bellyUp ?? 0) / 300).toBeGreaterThan(0.12);
    expect((counts.tailThump ?? 0) / 300).toBeGreaterThan(0.04);
  });

  it('shows the purr overlay while purring', () => {
    // 첫 클릭 반응이 골골송인 시드를 찾아, 그동안 purr 덧씌우기가 켜지는지 본다
    for (let seed = 1; seed <= 20; seed++) {
      const b = new Brain(mulberry32(seed), settings(), [main]);
      step(b, { clicks: 1 });
      if (step(b).behavior !== 'purr') continue;
      let purred = false;
      for (let t = 0; t < 2; t += 1 / 30) purred ||= step(b).overlays.purr;
      expect(purred).toBe(true);
      return;
    }
    throw new Error('no seed produced a purr in 20 tries');
  });

  it('gets annoyed after 5 clicks within 5 seconds, ignores clicks for 10s, then reacts again (Review Focus 2)', () => {
    const b = new Brain(mulberry32(25), settings(), [main]);
    let annoyed = false, thump = false;
    for (let i = 0; i < 5; i++) {
      step(b, { clicks: 1 });
      for (let t = 0; t < 0.5; t += 1 / 30) { const s = step(b); annoyed ||= s.behavior === 'annoyed'; thump ||= s.overlays.tailThump; }
    }
    expect(annoyed).toBe(true);
    expect(thump).toBe(true);
    step(b, { clicks: 1 });
    expect(['annoyed', 'wander']).toContain(step(b).behavior);
    for (let t = 0; t < 12; t += 1 / 30) step(b);
    step(b, { clicks: 1 });
    expect(['purr', 'bellyUp', 'tailThump']).toContain(step(b).behavior);
  });

  it('wakes up purring when clicked while asleep', () => {
    const b = new Brain(mulberry32(8), settings('calm'), [main]);
    expect(untilSleeping(b)).toBe(true);
    step(b, { clicks: 1 });
    expect(step(b).behavior).toBe('purr');
  });

  it('runs to the cursor and sits purring when summoned', () => {
    const b = new Brain(mulberry32(26), settings(), [main]);
    const cursor = { x: 300, y: 300 };
    step(b, { cursor, commands: [{ type: 'summon' }] });
    let sat = false;
    for (let t = 0; t < 10 && !sat; t += 1 / 30) {
      const s = step(b, { cursor });
      sat = s.pose === 'sit' && s.overlays.purr && dist(s.pos, cursor) < 130 * 1.5;
    }
    expect(sat).toBe(true);
  });

  it('walks off screen when hidden, ignores clicks and cursor, and comes back when shown (Review Focus 4)', () => {
    const b = new Brain(mulberry32(27), settings(), [main]);
    step(b, { commands: [{ type: 'hide' }] });
    let hidden = false;
    for (let t = 0; t < 30 && !hidden; t += 1 / 30) hidden = !step(b).visible;
    expect(hidden).toBe(true);
    const p = { ...b.state.pos };
    for (let t = 0; t < 30; t += 1 / 30) step(b, { cursor: wiggle({ x: 900, y: 900 }, t), clicks: 1 });
    expect(b.state.visible).toBe(false);
    expect(b.state.pos).toEqual(p);
    expect(b.state.behavior).toBe('hidden');
    step(b, { commands: [{ type: 'show' }] });
    expect(b.state.visible).toBe(true);
    for (let t = 0; t < 30; t += 1 / 30) step(b);
    expect(inside(b.state.pos, [main])).toBe(true);
  });

  it('can start hidden', () => {
    const b = new Brain(mulberry32(30), settings(), [main], { hidden: true });
    for (let t = 0; t < 5; t += 1 / 30) step(b, { clicks: 1 });
    expect(b.state.visible).toBe(false);
  });

  it('resumes from a saved snapshot only if it is on a current monitor', () => {
    const a = new Brain(mulberry32(28), settings(), [main], { restore: { pos: { x: 100, y: 200 }, heading: 1, pose: 'curl' } });
    expect(a.state.pos).toEqual({ x: 100, y: 200 });
    expect(a.state.pose).toBe('curl');
    const b = new Brain(mulberry32(28), settings(), [main], { restore: { pos: { x: -500, y: 200 }, heading: 1, pose: 'curl' } });
    expect(inside(b.state.pos, [main])).toBe(true);
    expect(b.state.pose).toBe('loaf');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/brain/brain.test.ts` / Expected: 새 테스트들이 FAIL (`stalk`·`purr`·`summon` 등 미구현, `Brain`의 4번째 인자 무시)

- [ ] **Step 3: `src/brain/brain.ts` 전체 교체**
```ts
// 베르의 두뇌 (순수 TS, three.js·Tauri 의존 없음). 모든 좌표는 월드 좌표.
// 작업 큐(자세 전환 → 걷기 → 머물기)를 처리하고, 비면 활동량 프리셋으로 다음 행동을 고른다.
// 커서·클릭·트레이 명령에는 진행 중인 작업을 끊고 반응한다 (spec §6.4~6.7).
import { clampToMonitors, bodyLenWorld, dist, inset, monitorAt, sameMonitors, type MonitorInfo, type Vec2, type WinInfo } from '../world';
import { chance, range, type Rng } from './rng';
import { chooseNext, PRESETS, type Activity, type NextKind, type RestKind } from './presets';
import { transitionTime, type PoseName } from '../cat/graph';
import { NO_OVERLAYS, type CatState, type Command, type Overlays } from '../state';

export type { CatState, Command, Gait, Layer, Overlays } from '../state';

export interface BrainInput { dt: number; cursor: Vec2 | null; windows: WinInfo[]; monitors: MonitorInfo[]; clicks: number; commands: Command[] }
export interface Settings { activity: Activity; bodyLengthCss: number }
/** 오버레이를 다시 만들 때 이어가기 위해 저장해 두는 최소 상태 */
export interface Snapshot { pos: Vec2; heading: number; pose: PoseName }
export interface BrainOptions { restore?: Snapshot | null; hidden?: boolean }

type Look = 'cursor' | Vec2;
type Task =
  | { t: 'pose'; pose: PoseName; left: number; started: boolean }
  | { t: 'walk'; to: Vec2; run: boolean; label?: string }
  | { t: 'hold'; pose: PoseName; left: number; overlays?: Partial<Overlays>; look?: Look; label?: string }
  | { t: 'chase'; left: number }
  | { t: 'visible'; visible: boolean };

const WALK_SPEED = 0.6, RUN_SPEED = 3.0;   // 몸길이/초
const TURN_RATE = { walk: 4, run: 7 };      // rad/초
const MAX_STEP_DT = 0.1;                    // 큰 dt는 잘게 나눠 처리
// 커서 반응 (spec §6.4). 속도는 CSS px/초, 거리는 몸길이 단위
const CHASE_SPEED = 600, MOVING_SPEED = 100, STILL_SPEED = 30;
const CHASE_RADIUS = 6, SNIFF_RADIUS = 4, EAR_RADIUS = 3, GIVE_UP_RADIUS = 10;
const CHASE_MAX_SEC = 20, CHASE_COOLDOWN = 15, STILL_BEFORE_SNIFF = 3, STILL_ENDS_CHASE = 1;
// 클릭 반응 (spec §6.5)
const CLICK_WINDOW = 5, CLICKS_TO_ANNOY = 5, ANNOYED_IGNORE = 10;
/** 커서에 반응해 끊어도 되는 행동 */
const INTERRUPTIBLE = new Set(['loaf', 'groom', 'bellyUp', 'wander', 'zoomies']);
const LYING: PoseName[] = ['loaf', 'lieSide', 'curl'];

export const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const approachAngle = (a: number, b: number, maxStep: number): number => {
  const d = angleDiff(a, b);
  return a + Math.max(-maxStep, Math.min(maxStep, d));
};

/** 두뇌 웹뷰가 이 시간 넘게 상태를 안 보내면(예: 전체화면 앱에 가려져 rAF가 멈춤) 뷰어는 멈춘 것으로 본다 */
export const STALE_SEC = 2;

/** 뷰어용: 오래된 상태면 제자리걸음하지 않도록 걷기를 멈춘다 (spec §10) */
export function staleSafe(s: CatState, ageSec: number): CatState {
  return ageSec > STALE_SEC && s.gait !== 'none' ? { ...s, gait: 'none', speed: 0 } : s;
}

const pose = (p: PoseName): Task => ({ t: 'pose', pose: p, left: 0, started: false });

export class Brain {
  private s: CatState;
  private queue: Task[] = [];
  private last: NextKind | null = null;
  private monitors: MonitorInfo[];
  private hidden: boolean;
  private time = 0;
  private cursor: Vec2 | null = null;
  private cursorPrev: Vec2 | null = null;
  private cursorSpeed = 0;        // CSS px/초 (부드럽게)
  private cursorStill = 0;        // 커서가 멈춰 있던 시간(초)
  private sniffedThisStill = false;
  private chaseReadyAt = 0;
  private clickTimes: number[] = [];
  private clicksIgnoredUntil = 0;

  constructor(private rng: Rng, public settings: Settings, monitors: MonitorInfo[], opts: BrainOptions = {}) {
    this.monitors = monitors;
    const restore = opts.restore && monitorAt(opts.restore.pos, monitors) ? opts.restore : null;
    this.hidden = !!opts.hidden;
    this.s = {
      pos: restore?.pos ?? this.home(), heading: restore?.heading ?? Math.PI / 2, pose: restore?.pose ?? 'loaf',
      gait: 'none', speed: 0, overlays: { ...NO_OVERLAYS }, layer: { kind: 'top' }, lookAt: null,
      visible: !this.hidden, behavior: this.hidden ? 'hidden' : 'loaf', bodyLengthCss: settings.bodyLengthCss,
    };
    if (!this.hidden) this.queue = [{ t: 'hold', pose: this.s.pose, left: range(rng, 5, 15), label: this.s.pose === 'loaf' ? 'loaf' : 'sleep' }];
  }

  get state(): CatState { return this.s; }

  /** 진행 중인 행동을 버리고 목적지로 간다 (테스트용) */
  walkTo(to: Vec2, run = false) {
    this.queue = [{ t: 'walk', to, run }];
    this.s.behavior = run ? 'run' : 'walk';
  }

  step(input: BrainInput): CatState {
    if (input.monitors.length && !sameMonitors(input.monitors, this.monitors)) this.syncMonitors(input.monitors);
    this.observeCursor(input.cursor, input.dt);
    for (const c of input.commands) this.handle(c);
    this.s.gait = 'none';
    this.s.speed = 0;
    this.s.overlays = { ...NO_OVERLAYS };
    this.s.lookAt = null;
    this.s.bodyLengthCss = this.settings.bodyLengthCss;
    if (!this.monitors.length) return this.s;
    if (input.clicks > 0) this.onClicks(input.clicks);
    this.reactToCursor(input.dt);

    let remaining = Math.max(0, input.dt);
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_STEP_DT);
      remaining -= dt;
      this.time += dt;
      this.advance(dt);
    }
    return this.s;
  }

  // ── 모니터 ─────────────────────────────────────────────

  private home(): Vec2 {
    const m = this.monitors.find((x) => x.primary) ?? this.monitors[0];
    return m ? { x: m.rect.x + m.rect.w / 2, y: m.rect.y + m.rect.h * 0.6 } : { x: 0, y: 0 };
  }

  private syncMonitors(ms: MonitorInfo[]) {
    const appeared = this.monitors.length === 0;
    this.monitors = ms;
    if (appeared || !monitorAt(this.s.pos, ms)) {
      // 처음 모니터를 알게 됐거나 있던 모니터가 사라짐 → 남은 모니터 안으로
      this.s.pos = appeared ? this.home() : clampToMonitors(this.s.pos, ms, this.margin(this.current()));
      this.queue = this.queue.filter((t) => t.t !== 'walk' && t.t !== 'chase');
    }
  }

  private current(): MonitorInfo { return monitorAt(this.s.pos, this.monitors) ?? this.monitors[0]; }
  private L(): number { return bodyLenWorld(this.settings.bodyLengthCss, this.current() ?? null); }
  private cssPerWorld(): number { return this.current()?.cssPerWorld ?? 1; }
  private margin(m: MonitorInfo): number { return bodyLenWorld(this.settings.bodyLengthCss, m) * 1.2; }

  // ── 입력 ───────────────────────────────────────────────

  private observeCursor(c: Vec2 | null, dt: number) {
    if (c && this.cursorPrev && dt > 0) {
      const v = (dist(c, this.cursorPrev) / dt) * this.cssPerWorld();
      this.cursorSpeed += (v - this.cursorSpeed) * Math.min(1, dt * 8);
    } else {
      this.cursorSpeed = 0;
    }
    if (this.cursorSpeed < STILL_SPEED) this.cursorStill += dt;
    else { this.cursorStill = 0; this.sniffedThisStill = false; }
    this.cursor = c;
    this.cursorPrev = c;
  }

  private handle(c: Command) {
    switch (c.type) {
      case 'setActivity': this.settings = { ...this.settings, activity: c.activity }; break;
      case 'setSize': this.settings = { ...this.settings, bodyLengthCss: c.bodyLengthCss }; break;
      case 'summon': {
        const cur = this.cursor;
        if (!cur || !this.monitors.length) break;
        if (this.hidden) this.appearAt(this.exitPoint(cur));
        const m = monitorAt(cur, this.monitors) ?? this.current();
        const spot = clampToMonitors({ x: cur.x, y: cur.y + 0.6 * this.L() }, [m], this.margin(m) * 0.5);
        this.s.behavior = 'summoned';
        this.queue = [{ t: 'walk', to: spot, run: true, label: 'summoned' }, pose('sit'), { t: 'hold', pose: 'sit', left: 4, overlays: { purr: true }, look: 'cursor', label: 'summoned' }];
        break;
      }
      case 'hide':
        if (this.hidden || !this.monitors.length) break;
        this.s.behavior = 'leaving';
        this.queue = [{ t: 'walk', to: this.exitPoint(this.s.pos), run: false, label: 'leaving' }, { t: 'visible', visible: false }];
        break;
      case 'show':
        if (!this.hidden || !this.monitors.length) break;
        this.appearAt(this.exitPoint(this.randomPoint()));
        this.queue = [{ t: 'walk', to: this.randomPoint(), run: false, label: 'entering' }];
        break;
    }
  }

  private appearAt(p: Vec2) {
    this.hidden = false;
    this.s.visible = true;
    this.s.pos = p;
    this.s.pose = 'stand';
    this.s.behavior = 'entering';
  }

  private onClicks(n: number) {
    if (this.hidden || this.time < this.clicksIgnoredUntil) return;
    for (let i = 0; i < n; i++) this.clickTimes.push(this.time);
    this.clickTimes = this.clickTimes.filter((t) => this.time - t <= CLICK_WINDOW);
    if (this.clickTimes.length >= CLICKS_TO_ANNOY) {
      this.clickTimes = [];
      this.clicksIgnoredUntil = this.time + ANNOYED_IGNORE;
      this.s.behavior = 'annoyed';
      this.queue = [
        { t: 'hold', pose: this.s.pose, left: 1.5, overlays: { tailThump: true }, label: 'annoyed' },
        { t: 'walk', to: this.randomPoint(), run: false, label: 'wander' },
      ];
      return;
    }
    if (this.s.behavior === 'sleep') { this.purr('loaf'); return; }
    const r = this.rng.next();
    if (r < 0.2 && LYING.includes(this.s.pose)) {
      this.s.behavior = 'bellyUp';
      this.queue = [pose('bellyUp'), { t: 'hold', pose: 'bellyUp', left: range(this.rng, 20, 40), label: 'bellyUp' }];
    } else if (r >= 0.2 && r < 0.3) {
      this.s.behavior = 'tailThump';
      this.queue = [{ t: 'hold', pose: this.s.pose, left: 1.5, overlays: { tailThump: true }, label: 'tailThump' }];
    } else {
      this.purr(this.s.pose === 'stand' || this.s.pose === 'crouch' ? 'sit' : this.s.pose);
    }
  }

  private purr(p: PoseName) {
    this.s.behavior = 'purr';
    this.queue = [pose(p), { t: 'hold', pose: p, left: range(this.rng, 3, 6), overlays: { purr: true }, label: 'purr' }];
  }

  private reactToCursor(dt: number) {
    const c = this.cursor;
    if (!c || this.hidden) return;
    const d = dist(c, this.s.pos) / this.L();
    const b = this.s.behavior;
    if (b === 'sleep') {
      if (d < EAR_RADIUS && this.cursorSpeed > MOVING_SPEED) {
        this.s.overlays.earTwitch = true;
        if (chance(this.rng, PRESETS[this.settings.activity].wakeOnCursorPerSec * dt)) {
          this.s.behavior = 'loaf';
          this.queue = [pose('loaf'), { t: 'hold', pose: 'loaf', left: range(this.rng, 2, 5), label: 'loaf' }];
        }
      }
      return;
    }
    if (!INTERRUPTIBLE.has(b)) return;
    if (this.time >= this.chaseReadyAt && d < CHASE_RADIUS && this.cursorSpeed >= CHASE_SPEED) {
      this.s.behavior = 'stalk';
      this.queue = [pose('crouch'), { t: 'hold', pose: 'crouch', left: range(this.rng, 0.5, 1.5), look: 'cursor', label: 'stalk' }, { t: 'chase', left: CHASE_MAX_SEC }];
    } else if (!this.sniffedThisStill && d < SNIFF_RADIUS && this.cursorStill >= STILL_BEFORE_SNIFF) {
      this.sniffedThisStill = true;
      this.s.behavior = 'sniff';
      this.queue = this.sniffTasks(c);
    }
  }

  // ── 작업 실행 ──────────────────────────────────────────

  /** dt 동안 작업을 진행한다. 한 작업이 끝나면 남은 시간으로 다음 작업을 이어간다. */
  private advance(dt: number) {
    for (let guard = 0; guard < 8 && dt > 0; guard++) {
      if (!this.queue.length) {
        if (this.hidden) return;
        this.planNext();
      }
      const left = this.run(this.queue[0], dt);
      if (left === null) return;
      this.queue.shift();
      dt = left;
    }
  }

  /** 작업 진행. 끝났으면 남은 시간(>=0), 진행 중이면 null */
  private run(task: Task, dt: number): number | null {
    switch (task.t) {
      case 'pose': {
        if (!task.started) {
          task.started = true;
          task.left = transitionTime(this.s.pose, task.pose);
          this.s.pose = task.pose;
        }
        task.left -= dt;
        return task.left <= 0 ? -task.left : null;
      }
      case 'hold': {
        if (task.label) this.s.behavior = task.label;
        Object.assign(this.s.overlays, task.overlays);
        if (task.look) this.s.lookAt = task.look === 'cursor' ? this.cursor : task.look;
        task.left -= dt;
        return task.left <= 0 ? -task.left : null;
      }
      case 'walk': {
        if (task.label) this.s.behavior = task.label;
        if (this.s.pose !== 'stand') return this.standUpFirst(dt);
        return this.moveToward(task.to, task.run, dt) ? dt : null;
      }
      case 'chase':
        return this.chase(task, dt);
      case 'visible':
        this.hidden = !task.visible;
        this.s.visible = task.visible;
        this.s.behavior = task.visible ? 'wander' : 'hidden';
        return dt;
    }
  }

  /** 걷기 전에 일어서기를 큐 앞에 끼워 넣고 이번 프레임부터 바로 시작한다 (advance가 끝난 쪽을 shift) */
  private standUpFirst(dt: number): number | null {
    this.queue.unshift(pose('stand'));
    return this.run(this.queue[0], dt);
  }

  /** 목적지로 한 걸음. 도착했으면 true */
  private moveToward(to: Vec2, run: boolean, dt: number): boolean {
    const L = this.L();
    const base = run ? RUN_SPEED : WALK_SPEED;
    const d = dist(this.s.pos, to);
    if (d < L * 0.1) return true;
    const want = Math.atan2(to.y - this.s.pos.y, to.x - this.s.pos.x);
    this.s.heading = approachAngle(this.s.heading, want, (run ? TURN_RATE.run : TURN_RATE.walk) * dt);
    // 가까우면 곧장 다가간다(목표 주위를 맴도는 것 방지), 멀면 몸이 향한 쪽으로 걷되 많이 틀어졌으면 감속
    const dir = d < L * 0.6 ? want : this.s.heading;
    const facing = Math.max(0.2, Math.cos(angleDiff(this.s.heading, want)));
    const stepLen = Math.min(d, base * L * dt * facing);
    // 목적지는 항상 모니터 안이므로, 가는 길에 모니터 사이 빈 공간을 지나는 것은 허용한다(그동안 안 보임)
    this.s.pos = { x: this.s.pos.x + Math.cos(dir) * stepLen, y: this.s.pos.y + Math.sin(dir) * stepLen };
    this.s.gait = run ? 'run' : 'walk';
    this.s.speed = base * facing;
    return false;
  }

  private chase(task: Extract<Task, { t: 'chase' }>, dt: number): number | null {
    this.s.behavior = 'chase';
    task.left -= dt;
    const c = this.cursor;
    const far = !c || dist(c, this.s.pos) > GIVE_UP_RADIUS * this.L();
    if (far || task.left <= 0 || this.cursorStill > STILL_ENDS_CHASE) {
      this.chaseReadyAt = this.time + CHASE_COOLDOWN;
      if (c && !far) this.queue.splice(1, 0, ...this.sniffTasks(c));
      return 0;
    }
    if (this.s.pose !== 'stand') return this.standUpFirst(dt);
    this.s.lookAt = c;
    this.moveToward(this.nearPoint(c, 0.3), true, dt);
    return null;
  }

  /** c 쪽으로 가되 bodyLens 몸길이만큼 못 미친 점 */
  private nearPoint(c: Vec2, bodyLens: number): Vec2 {
    const d = dist(c, this.s.pos);
    if (d < 1e-6) return { ...c };
    const k = Math.max(0, d - bodyLens * this.L()) / d;
    return { x: this.s.pos.x + (c.x - this.s.pos.x) * k, y: this.s.pos.y + (c.y - this.s.pos.y) * k };
  }

  private sniffTasks(c: Vec2): Task[] {
    return [
      { t: 'walk', to: this.nearPoint(c, 0.5), run: false, label: 'sniff' },
      { t: 'hold', pose: 'stand', left: 2, look: 'cursor', label: 'sniff' },
    ];
  }

  // ── 다음 행동 고르기 ───────────────────────────────────

  private planNext() {
    const kind = chooseNext(this.rng, this.settings.activity, this.last);
    this.last = kind;
    this.s.behavior = kind;
    const P = PRESETS[this.settings.activity];
    const dur = (k: RestKind) => range(this.rng, P.durations[k][0], P.durations[k][1]);
    const rest = (p: PoseName, seconds: number) => this.queue.push(pose(p), { t: 'hold', pose: p, left: seconds, label: kind });
    switch (kind) {
      case 'wander':
        this.queue.push({ t: 'walk', to: this.randomPoint(), run: false, label: 'wander' });
        break;
      case 'zoomies': {
        let from = this.s.pos;
        const hops = 2 + Math.floor(this.rng.next() * 3);
        for (let i = 0; i < hops; i++) { const to = this.nearbyPoint(from, 4); this.queue.push({ t: 'walk', to, run: true, label: 'zoomies' }); from = to; }
        break;
      }
      case 'sleep':
        this.queue.push({ t: 'walk', to: this.sleepSpot(), run: false, label: 'wander' });
        rest(chance(this.rng, 0.5) ? 'curl' : 'lieSide', dur('sleep'));
        break;
      case 'loaf':
        if (chance(this.rng, 0.5)) this.queue.push({ t: 'walk', to: this.randomPoint(), run: false, label: 'wander' });
        rest('loaf', dur('loaf'));
        break;
      case 'groom':
        rest('groom', dur('groom'));
        break;
      case 'bellyUp':
        rest('bellyUp', dur('bellyUp'));
        break;
    }
  }

  /** 면적에 비례해 모니터를 고르고 그 안(여백 제외)의 임의 점 */
  private randomPoint(): Vec2 {
    const total = this.monitors.reduce((s, m) => s + m.rect.w * m.rect.h, 0);
    let x = this.rng.next() * total, m = this.monitors[0];
    for (const mm of this.monitors) { x -= mm.rect.w * mm.rect.h; if (x < 0) { m = mm; break; } }
    const r = inset(m.rect, this.margin(m));
    return { x: r.x + this.rng.next() * r.w, y: r.y + this.rng.next() * r.h };
  }

  private nearbyPoint(from: Vec2, maxBodyLens: number): Vec2 {
    const m = monitorAt(from, this.monitors) ?? this.current();
    const L = bodyLenWorld(this.settings.bodyLengthCss, m);
    const a = this.rng.next() * Math.PI * 2, d = range(this.rng, 1.5, maxBodyLens) * L;
    return clampToMonitors({ x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d }, [m], this.margin(m));
  }

  /** 방해가 덜한 곳: 지금 모니터의 모서리 또는 아래쪽 가장자리 (창 위 자리는 계획 C) */
  private sleepSpot(): Vec2 {
    const m = this.current();
    const r = inset(m.rect, this.margin(m));
    if (chance(this.rng, 0.5)) return { x: chance(this.rng, 0.5) ? r.x : r.x + r.w, y: chance(this.rng, 0.5) ? r.y : r.y + r.h };
    return { x: r.x + this.rng.next() * r.w, y: r.y + r.h };
  }

  /** p에서 가장 가까운 화면 가장자리의 바깥 1.5 몸길이 지점. 다른 모니터와 붙은 가장자리는 피한다. */
  private exitPoint(p: Vec2): Vec2 {
    const m = monitorAt(p, this.monitors) ?? this.current();
    const r = m.rect, out = bodyLenWorld(this.settings.bodyLengthCss, m) * 1.5;
    const options = [
      { d: p.x - r.x, q: { x: r.x - out, y: p.y } },
      { d: r.x + r.w - p.x, q: { x: r.x + r.w + out, y: p.y } },
      { d: p.y - r.y, q: { x: p.x, y: r.y - out } },
      { d: r.y + r.h - p.y, q: { x: p.x, y: r.y + r.h + out } },
    ].filter((o) => !monitorAt(o.q, this.monitors));
    if (!options.length) return { x: r.x - out, y: p.y };
    return options.reduce((a, b) => (b.d < a.d ? b : a)).q;
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test && pnpm typecheck` / Expected: 기존 + 새 테스트 모두 PASS. 비율 테스트가 경계에서 흔들리면 시드 범위를 늘리지 말고 구현의 확률 분기(r 구간)를 spec §6.5와 대조한다.

- [ ] **Step 5: 커밋**
```bash
git add src/brain
git commit -m "feat: let Ber chase, sniff, purr, get annoyed, come when called and hide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 시선과 히트 판정

**Files:**
- Create: `src/camera.ts`, `src/hit.ts`, `src/hit.test.ts`
- Modify: `src/render.ts` (camera.ts 사용, `hitTest` 추가), `src/cat/animator.ts` (lookYaw 방향·두리번과 배타), `src/cat/animator.test.ts`

**Interfaces:**
- Produces: `camera.ts` — `TILT`, `makeCamera(tilt?)`, `frameCamera(cam, x0, y0, size)`, `placeRoot(root, posCss, heading, bodyLengthCss, tilt?) : number(yaw)`; `hit.ts` — `hitCat(root, cam, pCss, marginCss = 8): boolean`; `CatView.hitTest(pCss: Vec2): boolean`. **lookYaw 규칙:** 양수 = 베르의 오른쪽(모델 +Z)으로 고개를 돌림 = 화면에서 시계 방향.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/hit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildCat } from './cat/model';
import { BER } from './cat/params';
import { makeCamera, frameCamera, placeRoot } from './camera';
import { hitCat } from './hit';

describe('hitCat', () => {
  // 화면 (500, 400)에 오른쪽을 보고 선 몸길이 130px 베르. 몸통은 바닥보다 약 34px 위라 화면에선 위로 약 20px 올라가 보인다.
  const rig = buildCat(BER);
  const cam = makeCamera();
  placeRoot(rig.root, { x: 500, y: 400 }, 0, 130);
  frameCamera(cam, 300, 200, 400);

  it("hits Ber's body and head", () => {
    expect(hitCat(rig.root, cam, { x: 500, y: 385 })).toBe(true);
    expect(hitCat(rig.root, cam, { x: 552, y: 372 })).toBe(true);
  });
  it('misses empty space around Ber', () => {
    expect(hitCat(rig.root, cam, { x: 500, y: 250 })).toBe(false);
    expect(hitCat(rig.root, cam, { x: 650, y: 400 })).toBe(false);
  });
});
```

`src/cat/animator.test.ts`의 `describe('Animator', …)` 안에 추가 (파일 맨 위에 `import * as THREE from 'three';`):
```ts
  it("turns the head toward lookYaw (positive = toward Ber's right, model +Z)", () => {
    const rig = buildCat(BER);
    const anim = new Animator(rig, 'stand');
    const headZ = (lookYaw: number) => {
      for (let i = 0; i < 5; i++) anim.update(1 / 60, { gait: 'none', speed: 0, heading: 0, overlays: NO_OVERLAYS, lookYaw });
      rig.root.updateMatrixWorld(true);
      return rig.head.getWorldPosition(new THREE.Vector3()).z;
    };
    expect(headZ(0.8)).toBeGreaterThan(0.02);
    expect(headZ(-0.8)).toBeLessThan(-0.02);
    rig.dispose();
  });
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test src/hit.test.ts src/cat/animator.test.ts` / Expected: hit — `Failed to resolve import "./camera"`; animator lookYaw — `headZ(0.8)`가 음수라 FAIL (현재 부호가 반대)

- [ ] **Step 3: 구현**

`src/camera.ts`:
```ts
// 카메라·배치 수학. three.js만 쓰고 WebGL이 필요 없어서 테스트할 수 있다.
import * as THREE from 'three';
import type { Vec2 } from './world';
import { MODEL_BODY_LENGTH } from './cat/params';

export const TILT = (38 * Math.PI) / 180;
const CAM_DIST = 5000;

/** 수직에서 tilt만큼 기울여 +Z 쪽에서 내려다보는 직교 카메라. 바닥점 (x, 0, y / cos tilt)가 화면 CSS (x, y)에 온다. */
export function makeCamera(tilt = TILT): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, 1, CAM_DIST * 2);
  cam.up.set(0, Math.sin(tilt), -Math.cos(tilt));
  cam.position.set(0, CAM_DIST * Math.cos(tilt), CAM_DIST * Math.sin(tilt));
  cam.lookAt(0, 0, 0);
  return cam;
}

/** 카메라가 화면 CSS 영역 (x0, y0)~(x0+size, y0+size)만 보게 한다. 뷰 공간 y = -화면 y. */
export function frameCamera(cam: THREE.OrthographicCamera, x0: number, y0: number, size: number) {
  Object.assign(cam, { left: x0, right: x0 + size, top: -y0, bottom: -(y0 + size) });
  cam.updateProjectionMatrix();
}

/** 고양이 루트를 화면 CSS 위치·진행 방향·몸 길이에 맞게 놓고 바닥 기준 yaw를 돌려준다 */
export function placeRoot(root: THREE.Object3D, posCss: Vec2, heading: number, bodyLengthCss: number, tilt = TILT): number {
  const cosT = Math.cos(tilt);
  const yaw = Math.atan2(Math.sin(heading) / cosT, Math.cos(heading));
  root.position.set(posCss.x, 0, posCss.y / cosT);
  root.rotation.y = -yaw;
  root.scale.setScalar(bodyLengthCss / MODEL_BODY_LENGTH);
  return yaw;
}
```

`src/hit.ts`:
```ts
// 화면 CSS 점이 베르 몸 위인지: 카메라에서 광선을 쏴 메시와 만나는지 본다 (수염 같은 선은 제외).
import * as THREE from 'three';
import type { Vec2 } from './world';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const OFFSETS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

/** marginCss만큼 넓혀서 판정한다 (가는 꼬리·다리도 누르기 쉽게) */
export function hitCat(root: THREE.Object3D, cam: THREE.OrthographicCamera, pCss: Vec2, marginCss = 8): boolean {
  root.updateMatrixWorld(true);
  cam.updateMatrixWorld();
  // 스키닝된 몸통은 렌더 때만 뼈 행렬이 갱신되므로 직접 갱신한다
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
  for (const [dx, dy] of OFFSETS) {
    const vx = pCss.x + dx * marginCss, vy = -(pCss.y + dy * marginCss);
    ndc.set(((vx - cam.left) / (cam.right - cam.left)) * 2 - 1, ((vy - cam.bottom) / (cam.top - cam.bottom)) * 2 - 1);
    ray.setFromCamera(ndc, cam);
    if (ray.intersectObject(root, true).some((h) => (h.object as THREE.Mesh).isMesh)) return true;
  }
  return false;
}
```

`src/render.ts`: 
  - 파일 위의 `export const TILT = (38 * Math.PI) / 180;`와 `const CAM_DIST = 5000;`를 지우고 import 추가: `import { TILT, makeCamera, frameCamera, placeRoot } from './camera';`, `import { hitCat } from './hit';`, 그리고 `export { TILT } from './camera';`
  - 필드 `private camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, CAM_DIST * 2);` → `private camera: THREE.OrthographicCamera;`, 생성자에서 기존 카메라 설정 3줄(`this.camera.up…`, `position…`, `lookAt…`)을 `this.camera = makeCamera(tilt);`로.
  - `place()` 안의 yaw 계산과 `root.position/rotation/scale` 세 줄을 `const yaw = placeRoot(this.rig.root, posCss, heading, bodyLengthCss, this.tilt);`로 (생성자에서 `this.tilt = tilt` 저장, 필드 `private readonly tilt: number;`).
  - `render()`의 `Object.assign(this.camera, …); this.camera.updateProjectionMatrix();` 두 줄을 `frameCamera(this.camera, x0, y0, size);`로.
  - 메서드 추가:
    ```ts
    /** 화면 CSS 점이 베르 몸 위인지 (마지막으로 그린 프레임 기준) */
    hitTest(pCss: Vec2): boolean {
      if (!this.drewLast) return false;
      const b = this.boundsCss();
      if (pCss.x < b.x || pCss.y < b.y || pCss.x > b.x + b.w || pCss.y > b.y + b.h) return false;
      return hitCat(this.rig.root, this.camera, pCss);
    }
    ```

`src/cat/animator.ts`의 두리번·시선 두 줄
```ts
    if (!moving && eyes < 0.5) neckYaw += Math.sin(this.time * 0.37) * 0.12; // 두리번
    if (inp.lookYaw !== null) neckYaw += clamp(inp.lookYaw, -0.9, 0.9) * 0.8;
```
을
```ts
    // 시선: lookYaw > 0 이면 베르의 오른쪽(모델 +Z)으로. 목 회전 +y는 +X를 -Z 쪽으로 돌리므로 부호를 뒤집는다.
    if (inp.lookYaw !== null) neckYaw -= clamp(inp.lookYaw, -0.9, 0.9) * 0.8;
    else if (!moving && eyes < 0.5) neckYaw += Math.sin(this.time * 0.37) * 0.12; // 두리번
```
로 교체.

- [ ] **Step 4: 통과 확인** — Run: `pnpm test && pnpm typecheck` / Expected: 모두 PASS. hit 테스트의 화면 좌표가 미세하게 어긋나면 `boundsCss` 계산식(몸통 높이 × sin38°)으로 다시 계산해 테스트 좌표를 고치되, "몸 위는 맞고 빈 곳은 틀린다"는 의미는 유지한다.

- [ ] **Step 5: 갤러리로 렌더 변화 없음 확인** — `pnpm dev` 후 Playwright로 `http://localhost:1420/?gallery` 스크린샷. Expected: 계획 A 마지막 갤러리와 같은 모습.

- [ ] **Step 6: 커밋**
```bash
git add -A
git commit -m "feat: add raycast hit testing and fix the head-turn direction for lookAt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 오버레이 연결 (설정·명령·클릭·클릭 통과·시선·스냅샷)

**Files:**
- Modify: `src/overlay.ts` (전체 교체)

**Interfaces:**
- Consumes: Task 2 `bridge.getSettings/onCommand/sendClick/onClick`, `TrayCommand`; Task 3 `Brain` 옵션·`Snapshot`·`angleDiff`; Task 4 `CatView.hitTest`
- Produces: 완성된 오버레이 루프. 계획 C가 `windows` 입력과 마스킹을 여기에 더한다.

- [ ] **Step 1: `src/overlay.ts` 전체 교체**
```ts
// 오버레이 웹뷰: 주 모니터면 두뇌를 돌려 상태를 방송하고, 모든 웹뷰는 자기 모니터에 베르가 있으면 그린다.
// 커서가 베르 위에 있을 때만 이 창이 클릭을 받는다(나머지는 아래 앱으로 통과).
import { bridge, type TrayCommand } from './bridge';
import { CatView } from './render';
import { BER } from './cat/params';
import { Animator } from './cat/animator';
import { Brain, angleDiff, staleSafe, type CatState, type Command, type Snapshot } from './brain/brain';
import { mulberry32 } from './brain/rng';
import { SIZE_CSS } from './brain/presets';
import { rectContains, worldToLocal, type MonitorInfo, type Vec2 } from './world';

const REST_FPS = 15;
const SNAPSHOT_KEY = 'ber.snapshot';
const SNAPSHOT_EVERY_MS = 5000;

const toCommand = (c: TrayCommand): Command => (c.type === 'setSize' ? { type: 'setSize', bodyLengthCss: SIZE_CSS[c.size] } : c);

function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(s: CatState) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ pos: s.pos, heading: s.heading, pose: s.pose } satisfies Snapshot));
  } catch {
    /* 저장 실패해도 동작에는 지장 없다 */
  }
}

export async function runOverlay() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const monitors = await bridge.getMonitors();
  const base = monitors.find((m) => m.id === bridge.monitorId);
  if (!base) {
    // 모니터 구성이 바뀌는 중에 뜬 창: 곧 다시 만들어지므로 아무것도 하지 않는다 (두뇌가 둘 생기는 것 방지)
    bridge.log(`overlay: monitor ${bridge.monitorId} not in [${monitors.map((m) => m.id).join(',')}]`);
    return;
  }
  const origin = await bridge.windowOriginWorld();
  // OS가 창을 옮겼을 수 있으니 실제 창 원점을 기준으로 변환한다
  const me: MonitorInfo = { ...base, rect: { ...base.rect, x: origin.x, y: origin.y } };
  const rs = await bridge.getSettings();

  const view = new CatView(canvas, BER);
  const resize = () => view.resize(innerWidth, innerHeight);
  resize();
  addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', () => location.reload());
  bridge.log(`overlay start monitor=${me.id} primary=${me.primary} origin=${origin.x},${origin.y} size=${innerWidth}x${innerHeight} monitors=${monitors.length}`);

  const animator = new Animator(view.rig, 'loaf');
  let state: CatState | null = null;
  let cursor: Vec2 | null = null;
  let clicks = 0;
  let receivedAt = 0;
  const commands: Command[] = [];
  const brain = me.primary
    ? new Brain(mulberry32((Math.random() * 2 ** 32) >>> 0), { activity: rs.activity, bodyLengthCss: SIZE_CSS[rs.size] }, monitors, { restore: loadSnapshot(), hidden: !rs.visible })
    : null;
  if (brain) {
    await bridge.onCommand((c) => { commands.push(toCommand(c)); });
    await bridge.onClick(() => { clicks++; });
  } else {
    await bridge.onCatState<CatState>((s) => { state = s; receivedAt = performance.now(); });
  }

  // 클릭 통과 전환: 커서가 이 모니터의 베르 몸 위에 있을 때만 클릭을 받는다
  let clickable = false;
  const updateClickThrough = () => {
    const over = !!cursor && !!state?.visible && rectContains(me.rect, cursor) && view.hitTest(worldToLocal(cursor, me));
    if (over !== clickable) {
      clickable = over;
      void bridge.setClickThrough(!over);
    }
  };
  await bridge.onCursor((p) => { cursor = p; updateClickThrough(); });
  canvas.addEventListener('pointerdown', () => { void bridge.sendClick(); });

  // 움직일 때는 rAF(디스플레이 주기), 쉴 때는 REST_FPS 타이머로 돈다.
  // 쉬는 중에도 rAF를 계속 돌리면 렌더를 건너뛰어도 WebKit·WindowServer가 매 프레임 일한다(측정으로 확인).
  let last = performance.now(), lastSent = '', lastSentAt = 0, lastSnapshot = 0;
  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1); // 잠자기·깨우기 후 거대한 dt는 1초로 자르고, 두뇌가 다시 잘게 나눈다
    last = now;
    if (brain) {
      state = brain.step({ dt, cursor, windows: [], monitors, clicks, commands: commands.splice(0) });
      clicks = 0;
    }
    let busy = false;
    if (state) {
      if (!brain) state = staleSafe(state, (now - receivedAt) / 1000);
      busy = state.gait !== 'none' || animator.transitioning || state.pose !== animator.pose || state.overlays.purr || state.overlays.tailThump || state.overlays.earTwitch;
      if (brain) {
        // 바뀌었을 때만 방송하되 1초마다 한 번은 보낸다 (새로 뜬 뷰어가 오래 자는 베르를 놓치지 않게)
        const json = JSON.stringify(state);
        if (json !== lastSent || now - lastSentAt > 1000) { lastSent = json; lastSentAt = now; void bridge.sendCatState(state); }
        if (now - lastSnapshot > SNAPSHOT_EVERY_MS) { lastSnapshot = now; saveSnapshot(state); }
      }
      animator.setTarget(state.pose);
      view.place(worldToLocal(state.pos, me), state.heading, state.bodyLengthCss);
      // 베르가 이 모니터에 없으면 애니메이션 계산도 건너뛰고 느린 주기로 돈다
      // (그리기만 멈추면 꼬리 형상 재생성 등은 계속 돌고, 멈춘 애니메이터 때문에 '바쁨'이 풀리지 않는다)
      if (!state.visible || !view.onCanvas()) {
        view.clear();
        busy = false;
      } else {
        const lookYaw = state.lookAt ? angleDiff(state.heading, Math.atan2(state.lookAt.y - state.pos.y, state.lookAt.x - state.pos.x)) : null;
        animator.update(Math.min(dt, 0.1), { gait: state.gait, speed: state.speed, heading: state.heading, overlays: state.overlays, lookYaw });
        view.render();
      }
      updateClickThrough(); // 멈춘 커서 밑으로 베르가 오가도 클릭 통과를 다시 판정한다 (Review Focus 1)
    }
    if (busy) requestAnimationFrame(tick);
    else setTimeout(tick, 1000 / REST_FPS);
  };
  tick();
}
```
  Run: `pnpm typecheck && pnpm test` / Expected: 오류 없음, 전체 PASS

- [ ] **Step 2: 실제 실행 확인 (사용자 눈 확인 필요 — 화면 녹화 권한이 없어 직접 볼 수 없음)**

Run (백그라운드): `pnpm tauri dev`. 사용자에게 아래를 확인받는다.
- 베르 근처에서 커서를 빠르게 흔들면: 몸을 낮췄다가 쫓아온다. 커서를 멈추면 다가와 냄새를 맡는다.
- 베르를 클릭하면: 대개 눈을 감고 골골(몸이 미세하게 떨림), 가끔 배까기·꼬리 탁탁. 5초 안에 5번 누르면 꼬리를 탁탁 치고 다른 곳으로 간다.
- 베르가 아닌 곳의 클릭은 아래 앱으로 그대로 간다.
- 트레이: "이리 와"(커서로 달려와 앉음), "숨기기"(화면 밖으로 걸어 나감 → 메뉴 문구가 "보이기"로), "보이기"(가장자리에서 들어옴), 활동량·크기 체크 표시 이동과 즉시 반영, 앱 재시작 후에도 설정 유지. ("로그인 시 실행"은 개발 빌드에서 누르지 않는다.)
- 베르를 클릭하면 macOS 포커스가 베르로 넘어가는 것은 알려진 한계(spec §13)임을 안내한다.

- [ ] **Step 3: 커밋**
```bash
git add -A
git commit -m "feat: wire settings, tray commands, petting and click-through into the overlay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 계획 B 완료 기준
- `pnpm test`, `pnpm typecheck`, `cargo test` 전부 통과
- 커서·클릭·트레이 반응이 spec §6.4·6.5·6.7대로 동작함을 사용자가 확인
- 숨김·활동량·크기 설정이 재시작 후에도 유지됨
