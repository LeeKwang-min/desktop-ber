# 계획 C: 창 위에서 자기·창 밑에 숨기 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 베르가 다른 앱 창의 제목 표시줄 위에서 자고(창을 옮기면 따라가고, 창이 사라지면 내려옴), 가끔 창 가장자리로 가서 그 창 밑으로 숨었다가 나온다. 숨은 부분은 실제로 창에 가려져 보인다 (macOS).

**Architecture:** Rust가 `CGWindowListCopyWindowInfo`로 다른 앱 창 목록을 10Hz로 읽어 순수 필터(`window_list::filter`)를 거쳐 `windows` 이벤트로 방송한다. 두뇌는 창 목록으로 낮잠 자리·숨을 가장자리를 고르고, 붙어 있는 창을 추적한다. 렌더러는 레이어가 `under(창)`일 때 그 창과 그 앞의 창 사각형을 "알파 0으로 덮어쓰는" 쿼드로 지워 가려진 것처럼 보이게 하고, 가려진 부분은 클릭 판정에서도 뺀다.

**Tech Stack:** Rust (core-graphics 0.25, core-foundation 0.10), TypeScript, three.js, vitest

**Spec:** `docs/superpowers/specs/2026-10-16-ber-desktop-cat-design.md` (§6.2 낮잠 50%·숨기 30%, §6.3 잘 곳 우선순위, §6.6 창과의 관계, §7.1 창 목록, §7.2 마스킹, §7.3 (3) 가려진 곳은 클릭 판정 제외)

**계획 시리즈:** A(완료) → B(완료) → **C(이 문서)** → D(Windows·배포)

## Global Constraints

- 계획 A·B의 Global Constraints 전부 유지.
- 창 필터(spec §7.1): `layer == 0`, `alpha > 0`, 소유 PID ≠ 자기, 너비 ≥ 80 · 높이 ≥ 40, **앞→뒤 순서 유지**. 화면 기록 권한이 필요 없게 창 제목은 읽지 않는다.
- 창 목록 주기 10Hz, 바뀌었을 때 + 1초 하트비트로 방송.
- 낮잠: 잠 행동의 50%가 창 위(가능한 창이 있을 때). 자리 = 창 윗변에서 0.25 몸길이 아래, 좌우 끝에서 1.5 몸길이 안쪽. 앞 창에 가려진 제목 표시줄은 제외. 창이 움직이면 같은 만큼 따라가고, 사라지면 일어나서 다음 행동.
- 숨기: 어슬렁의 30%가 숨기로 끝남(가능한 창이 있을 때). 왼쪽·오른쪽·아래 가장자리(제목 표시줄인 윗변 제외)의 25~75% 지점. 30%는 얼굴만 내밀기. 10~60초 머문 뒤 나온다. 창이 움직이거나 사라지면 즉시 나온다(레이어 `top`).
- 크기 조건: 창이 너비 3 몸길이·높이 2 몸길이 이상일 때만 낮잠·숨기 대상.

## Review Focus

1. **베르가 창 위에서 자는 중에 사용자가 그 창을 드래그** → 매 갱신마다 같은 만큼 따라가야 하고, 따라가는 중 다른 행동이 끼어들어도(클릭·커서) 창에 계속 끌려가면 안 된다. Task 3 테스트로 고정.
2. **숨어 있는 창을 최소화·닫기·이동** → 즉시 `top` 레이어로 나와야 한다(가려진 채 남거나, 없는 창 기준으로 마스킹하면 안 된다). Task 3 테스트로 고정.
3. **창 목록이 아직 안 왔거나 비어 있음** → 낮잠·숨기를 시도하지 않고 계획 A·B 동작을 그대로. Task 3 테스트로 고정.
4. **숨은 상태에서 가려진 부분을 클릭** → 클릭은 아래(가린) 창으로 가야 하고 베르는 반응하지 않아야 한다. Task 2에서 히트 판정 제외.
5. **창이 여러 겹 겹친 상태로 숨음** → 숨은 창보다 앞에 있는 창들도 베르를 가려야 한다. Task 4 오버레이에서 `windows[0..=idx]` 전부를 가림막으로.

---

## File Structure

```
src-tauri/src/
├─ window_list.rs (신규)     RawWindow·WinInfo·filter (+ 테스트)
├─ platform/macos.rs        raw_windows() 추가 (CGWindowList 파싱)
├─ platform/fallback.rs     raw_windows() → 빈 목록 (계획 D에서 Windows 구현)
├─ poller.rs                10Hz 창 목록 방송
└─ lib.rs                   mod window_list
src/
├─ world.ts (+ test)        rectToLocal 추가
├─ render.ts                setOccluders(): 지우기 쿼드, hitTest에서 가려진 곳 제외
├─ gallery.ts               ?occlude=1 가림 데모
├─ brain/brain.ts (+ test)  낮잠·숨기·창 추적, interrupt()로 큐 교체를 한 곳에
├─ bridge.ts                onWindows
└─ overlay.ts               창 목록 → 두뇌·가림막
```

---

### Task 1: 다른 앱 창 목록 (Rust)

**Files:**
- Create: `src-tauri/src/window_list.rs`
- Modify: `src-tauri/src/platform/macos.rs`, `src-tauri/src/platform/fallback.rs`, `src-tauri/src/poller.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: Rust `window_list::{RawWindow {id, pid, layer, alpha, rect}, WinInfo {id, rect}, filter(&[RawWindow], own_pid) -> Vec<WinInfo>}`, `platform::raw_windows() -> Vec<RawWindow>`; 이벤트 `windows` (payload `[{id, rect:{x,y,w,h}}]`, 앞→뒤, 월드 좌표)

- [ ] **Step 1: 실패하는 필터 테스트와 함께 `src-tauri/src/window_list.rs` 작성 (`filter`는 `unimplemented!()`)**
```rust
// 다른 앱 창 목록: OS 원시값을 공통 구조로 바꾼 뒤 여기서 거른다 (순수 함수, 테스트 대상)
use crate::geometry::Rect;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RawWindow {
    pub id: u64,
    pub pid: i64,
    pub layer: i64,
    pub alpha: f64,
    pub rect: Rect,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct WinInfo {
    pub id: u64,
    pub rect: Rect,
}

const MIN_W: f64 = 80.0;
const MIN_H: f64 = 40.0;

/// 앞→뒤 순서를 유지한 채, 일반 앱 창(레이어 0)이면서 보이고, 내 창이 아니고, 너무 작지 않은 것만 남긴다
pub fn filter(_raw: &[RawWindow], _own_pid: i64) -> Vec<WinInfo> {
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(id: u64, pid: i64, layer: i64, alpha: f64, w: f64, h: f64) -> RawWindow {
        RawWindow { id, pid, layer, alpha, rect: Rect { x: 10.0, y: 20.0, w, h } }
    }

    #[test]
    fn keeps_normal_visible_foreign_windows_in_front_to_back_order() {
        let list = [
            raw(1, 100, 0, 1.0, 800.0, 600.0),
            raw(2, 7, 0, 1.0, 800.0, 600.0),   // 내 창
            raw(3, 100, 25, 1.0, 800.0, 24.0), // 메뉴바 등 레이어 0이 아닌 창
            raw(4, 200, 0, 0.0, 800.0, 600.0), // 투명
            raw(5, 200, 0, 1.0, 50.0, 600.0),  // 너무 좁음
            raw(6, 200, 0, 1.0, 400.0, 30.0),  // 너무 낮음
            raw(7, 300, 0, 0.5, 300.0, 200.0),
        ];
        let ids: Vec<u64> = filter(&list, 7).iter().map(|w| w.id).collect();
        assert_eq!(ids, vec![1, 7]);
    }

    #[test]
    fn serializes_as_the_webview_expects() {
        let w = WinInfo { id: 9, rect: Rect { x: 1.0, y: 2.0, w: 3.0, h: 4.0 } };
        assert_eq!(serde_json::to_string(&w).unwrap(), r#"{"id":9,"rect":{"x":1.0,"y":2.0,"w":3.0,"h":4.0}}"#);
    }
}
```
  `src-tauri/src/lib.rs` mod 목록에 `mod window_list;` 추가. `Cargo.toml`의 macOS 의존성에 `core-foundation = "0.10"` 추가.

- [ ] **Step 2: 실패 확인** — Run: `(cd src-tauri && cargo test window_list)` / Expected: `keeps_normal_visible…` FAILED (`not implemented`)

- [ ] **Step 3: `filter` 구현**
```rust
pub fn filter(raw: &[RawWindow], own_pid: i64) -> Vec<WinInfo> {
    raw.iter()
        .filter(|w| w.layer == 0 && w.alpha > 0.0 && w.pid != own_pid && w.rect.w >= MIN_W && w.rect.h >= MIN_H)
        .map(|w| WinInfo { id: w.id, rect: w.rect })
        .collect()
}
```
  Run: `(cd src-tauri && cargo test window_list)` / Expected: 2 passed

- [ ] **Step 4: macOS 원시 창 목록** — `src-tauri/src/platform/macos.rs`에 추가:
```rust
use crate::window_list::RawWindow;
use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::geometry::CGRect;
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionOnScreenOnly, kCGWindowNumber, kCGWindowOwnerPID,
};

/// 화면에 보이는 창을 앞→뒤 순서로. 좌표는 CG 전역(포인트, 좌상단 원점) = 월드 좌표. 창 제목은 읽지 않는다(화면 기록 권한 불필요).
pub fn raw_windows() -> Vec<RawWindow> {
    let Some(list) = copy_window_info(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| {
            let dict: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*item as CFDictionaryRef) };
            let key = |k: CFStringRef| unsafe { CFString::wrap_under_get_rule(k) };
            let num = |k: CFStringRef| dict.find(&key(k)).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_f64());
            let bounds = dict
                .find(&key(unsafe { kCGWindowBounds }))
                .and_then(|v| v.downcast::<CFDictionary>())
                .and_then(|d| CGRect::from_dict_representation(&d))?;
            Some(RawWindow {
                id: num(unsafe { kCGWindowNumber })? as u64,
                pid: num(unsafe { kCGWindowOwnerPID })? as i64,
                layer: num(unsafe { kCGWindowLayer })? as i64,
                alpha: num(unsafe { kCGWindowAlpha }).unwrap_or(1.0),
                rect: crate::geometry::Rect { x: bounds.origin.x, y: bounds.origin.y, w: bounds.size.width, h: bounds.size.height },
            })
        })
        .collect()
}
```
  `src-tauri/src/platform/fallback.rs`에 추가:
```rust
/// 계획 D에서 Windows용(EnumWindows)으로 구현한다
pub fn raw_windows() -> Vec<crate::window_list::RawWindow> {
    Vec::new()
}
```
  Run: `(cd src-tauri && cargo build)` / Expected: 성공. core-foundation API 이름·시그니처가 맞지 않으면(예: `find`가 참조를 받는지, `downcast` 대상 타입) docs.rs의 core-foundation 0.10 / core-graphics 0.25 문서로 맞춘다.

- [ ] **Step 5: 10Hz 방송** — `src-tauri/src/poller.rs`의 루프에서 커서 처리 다음에 추가하고, 루프 앞에 `let mut last_windows: Vec<window_list::WinInfo> = Vec::new();`, use 목록에 `window_list` 추가:
```rust
            // 다른 앱 창 목록 ~10Hz. 바뀌었을 때 + 1초마다 한 번(새로 뜬 웹뷰가 받도록)
            if tick % 6 == 0 {
                let w = window_list::filter(&platform::raw_windows(), std::process::id() as i64);
                if w != last_windows || tick % 60 == 0 {
                    let _ = app.emit("windows", &w);
                    last_windows = w;
                }
            }
```
  Run: `(cd src-tauri && cargo test)` / Expected: 컴파일 성공, 6 passed

- [ ] **Step 6: 실제 창 목록 확인** — 임시로 `src-tauri/src/poller.rs`의 방송 직전에 `eprintln!("windows: {}", w.len());`를 넣고 `pnpm tauri dev`로 10초 실행, 로그에 열린 앱 창 수에 맞는 숫자가 찍히는지 확인한 뒤 그 줄을 지운다.

- [ ] **Step 7: 커밋**
```bash
git add -A
git commit -m "feat: broadcast other apps' window list from CGWindowList at 10Hz

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 창 밑 가리기 (렌더러 마스킹)

**Files:**
- Modify: `src/world.ts`, `src/world.test.ts`, `src/render.ts`, `src/gallery.ts`

**Interfaces:**
- Produces: `rectToLocal(r: Rect, m: MonitorInfo): Rect`; `CatView.setOccluders(rectsCss: Rect[])` (캔버스 CSS 좌표), `hitTest`가 가림막 안의 점은 false.

- [ ] **Step 1: 실패하는 테스트** — `src/world.test.ts`의 describe 안에 추가 (import에 `rectToLocal` 추가):
```ts
  it('converts a world rect to local css px', () => {
    const r = rectToLocal({ x: 2560 + 300, y: 150, w: 600, h: 300 }, win150);
    expect(r.x).toBeCloseTo(200);
    expect(r.y).toBeCloseTo(100);
    expect(r.w).toBeCloseTo(400);
    expect(r.h).toBeCloseTo(200);
  });
```
  Run: `pnpm test src/world.test.ts` / Expected: FAIL — `rectToLocal is not a function`

- [ ] **Step 2: 구현** — `src/world.ts`에 추가:
```ts
export function rectToLocal(r: Rect, m: MonitorInfo): Rect {
  const p = worldToLocal(r, m);
  return { x: p.x, y: p.y, w: r.w * m.cssPerWorld, h: r.h * m.cssPerWorld };
}
```
  Run: `pnpm test src/world.test.ts` / Expected: PASS

- [ ] **Step 3: 가림막 그리기** — `src/render.ts`:
  - import에 `rectContains`를 추가: `import { rectContains, type Rect, type Vec2 } from './world';`
  - 필드 추가:
    ```ts
    private occluders: Rect[] = [];
    private maskScene = new THREE.Scene();
    private maskCam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
    private maskQuad = new THREE.PlaneGeometry(1, 1);
    // 그린 색과 알파를 0으로 덮어써서 그 부분을 투명하게 만든다 (창에 가려진 것처럼)
    private maskMat = new THREE.MeshBasicMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.ZeroFactor,
    });
    ```
  - 메서드 추가:
    ```ts
    /** 베르를 가리는 창 사각형들 (캔버스 CSS 좌표). 레이어가 top이면 빈 배열. */
    setOccluders(rectsCss: Rect[]) {
      this.occluders = rectsCss;
      this.maskScene.clear();
      for (const r of rectsCss) {
        const m = new THREE.Mesh(this.maskQuad, this.maskMat);
        m.position.set(r.x + r.w / 2, -(r.y + r.h / 2), 0);
        m.scale.set(r.w, r.h, 1);
        this.maskScene.add(m);
      }
    }
    ```
  - `render()`의 `R.render(this.scene, this.camera);` 다음에:
    ```ts
    if (this.occluders.length) {
      Object.assign(this.maskCam, { left: x0, right: x0 + size, top: -y0, bottom: -(y0 + size) });
      this.maskCam.updateProjectionMatrix();
      R.render(this.maskScene, this.maskCam);
    }
    ```
  - `hitTest()`의 바운딩 박스 검사 다음 줄에: `if (this.occluders.some((r) => rectContains(r, pCss))) return false; // 창에 가려진 곳은 아래 창이 클릭을 받는다`

- [ ] **Step 4: 갤러리 가림 데모** — `src/gallery.ts`의 `add()`에서 `view.resize(320, 240);` 다음에:
```ts
    if (q.get('occlude')) view.setOccluders([{ x: 160, y: 0, w: 160, h: 240 }]); // 오른쪽 절반을 창이 가린 것처럼
```
  Run: `pnpm dev` → Playwright `http://localhost:1420/?gallery&occlude=1` 스크린샷. Expected: 모든 칸에서 베르의 오른쪽 절반(그림자 포함)이 정확히 잘려 투명. 왼쪽 절반은 그대로.

- [ ] **Step 5: 전체 확인과 커밋** — Run: `pnpm test && pnpm typecheck` / Expected: 모두 PASS
```bash
git add -A
git commit -m "feat: mask Ber where windows cover him and exclude covered parts from hit testing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 두뇌의 창 행동 (낮잠·숨기·추적)

**Files:**
- Modify: `src/brain/brain.ts`
- Test: `src/brain/brain.test.ts`

**Interfaces:**
- Consumes: `WinInfo[]` (`BrainInput.windows`, 앞→뒤), `rectContains`
- Produces: `CatState.layer`가 `{kind:'under', windowId}`가 되는 동안 숨음. 낮잠 중 `behavior === 'sleep'`. 숨는 중 `behavior === 'hide'`.

- [ ] **Step 1: 실패하는 테스트** — `src/brain/brain.test.ts` 끝에 추가:
```ts
describe('Brain and windows', () => {
  const win = (id: number, x: number, y: number, w = 900, h = 600): WinInfo => ({ id, rect: { x, y, w, h } });
  const run = (b: Brain, windows: WinInfo[], seconds: number, until?: (s: CatState) => boolean) => {
    for (let t = 0; t < seconds; t += 1 / 15) {
      const s = b.step({ ...input([main], 1 / 15), windows });
      if (until?.(s)) return s;
    }
    return null;
  };
  const onTitleBar = (s: CatState, w: WinInfo) => s.pos.x > w.rect.x && s.pos.x < w.rect.x + w.rect.w && Math.abs(s.pos.y - (w.rect.y + 0.25 * 130)) < 5;

  it('naps on a window title bar, follows the window, and gets up when it closes (Review Focus 1)', () => {
    const w = win(42, 400, 300);
    let napped: CatState | null = null;
    for (let seed = 1; seed <= 30 && !napped; seed++) {
      const b = new Brain(mulberry32(seed), settings('calm'), [main]);
      const s = run(b, [w], 3 * 3600, (st) => st.behavior === 'sleep' && st.gait === 'none' && onTitleBar(st, w));
      if (!s) continue;
      napped = s;
      const before = { ...s.pos };
      const moved = win(42, 500, 350);
      const after = b.step({ ...input([main], 1 / 15), windows: [moved] });
      expect(after.pos.x - before.x).toBeCloseTo(100);
      expect(after.pos.y - before.y).toBeCloseTo(50);
      // 클릭으로 끼어든 뒤에는 창을 움직여도 끌려가지 않는다
      b.step({ ...input([main], 1 / 15), windows: [moved], clicks: 1 });
      const p = { ...b.state.pos };
      b.step({ ...input([main], 1 / 15), windows: [win(42, 900, 350)] });
      expect(b.state.pos).toEqual(p);
      break;
    }
    expect(napped).not.toBeNull();

    // 창이 사라지면 일어난다
    for (let seed = 1; seed <= 30; seed++) {
      const b = new Brain(mulberry32(seed), settings('calm'), [main]);
      if (!run(b, [w], 3 * 3600, (st) => st.behavior === 'sleep' && st.gait === 'none' && onTitleBar(st, w))) continue;
      const s = run(b, [], 2, (st) => st.behavior !== 'sleep');
      expect(s).not.toBeNull();
      return;
    }
  }, 60000);

  it('hides under a window edge and comes back out on top (spec §6.6)', () => {
    const w = win(7, 300, 200);
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Brain(mulberry32(seed), settings('active'), [main]);
      const hid = run(b, [w], 3 * 3600, (s) => s.layer.kind === 'under');
      if (!hid) continue;
      expect(hid.layer).toEqual({ kind: 'under', windowId: 7 });
      const out = run(b, [w], 120, (s) => s.layer.kind === 'top');
      expect(out).not.toBeNull();
      return;
    }
    throw new Error('never hid in 40 seeds');
  }, 60000);

  it('comes out immediately when the hiding window moves or disappears (Review Focus 2)', () => {
    const w = win(7, 300, 200);
    for (let seed = 1; seed <= 40; seed++) {
      const b = new Brain(mulberry32(seed), settings('active'), [main]);
      if (!run(b, [w], 3 * 3600, (s) => s.layer.kind === 'under' && s.behavior === 'hide')) continue;
      expect(b.step({ ...input([main], 1 / 15), windows: [win(7, 360, 200)] }).layer.kind).toBe('top');
      return;
    }
    throw new Error('never hid in 40 seeds');
  }, 60000);

  it('never naps on or hides under windows when none are known (Review Focus 3)', () => {
    const b = new Brain(mulberry32(4), settings('active'), [main]);
    for (let i = 0; i < 2 * 3600 * 15; i++) {
      const s = b.step(input([main], 1 / 15));
      if (s.layer.kind !== 'top') throw new Error('went under a window that does not exist');
    }
  }, 30000);
});
```
  import 수정: `import { Brain, angleDiff, staleSafe, STALE_SEC, type BrainInput, type CatState, type Settings } from './brain';`, `import { dist, rectContains, type MonitorInfo, type Vec2, type WinInfo } from '../world';`
  Run: `pnpm test src/brain/brain.test.ts` / Expected: 앞의 세 테스트 FAIL (낮잠·숨기 미구현), 마지막은 PASS

- [ ] **Step 2: 구현** — `src/brain/brain.ts`에 다음을 반영한다.
  1. import에 `rectContains`와 `type Rect` 추가.
  2. `Task` 유니온에 세 종류 추가:
     ```ts
       | { t: 'attach'; windowId: number }                 // 이 창에 붙어서 같이 움직인다 (낮잠)
       | { t: 'detach' }
       | { t: 'layer'; under: number | null }             // null이면 top
     ```
  3. 필드 추가:
     ```ts
     private windows: WinInfo[] = [];
     private nap: { id: number; rect: Rect } | null = null;    // 붙어서 자는 창
     private under: { id: number; rect: Rect } | null = null;  // 밑에 숨은 창
     ```
  4. `step()`에서 `this.observeCursor(...)` 바로 다음에:
     ```ts
     this.windows = input.windows;
     this.trackWindows();
     ```
  5. 진행 중 작업을 끊고 바꾸는 곳(커서·클릭·명령 반응, `syncMonitors`의 걷기 제거 제외)에서 `this.queue = [...]; this.s.behavior = X;` 대신 아래 헬퍼를 쓴다. 끼어들면 창에서 떨어지고 숨기도 끝난다:
     ```ts
     /** 진행 중인 행동을 끊고 새 작업으로. 창에 붙어 있던 것·숨어 있던 것도 끝낸다 (Review Focus 1). */
     private interrupt(behavior: string, tasks: Task[]) {
       this.nap = null;
       if (this.under) { this.under = null; this.s.layer = { kind: 'top' }; }
       this.s.behavior = behavior;
       this.queue = tasks;
     }
     ```
     적용 대상: `handle()`의 summon·hide·show, `onClicks()`의 annoyed·bellyUp·tailThump, `purr()`, `reactToCursor()`의 깨기·stalk·sniff. (`walkTo()`도 `interrupt(run ? 'run' : 'walk', [...])`로)
  6. 창 추적:
     ```ts
     private trackWindows() {
       if (this.nap) {
         const w = this.windows.find((x) => x.id === this.nap!.id);
         if (!w) {
           // 자던 창이 닫히거나 최소화됨 → 일어나서 다음 행동
           this.interrupt('wander', [pose('stand'), { t: 'hold', pose: 'stand', left: 0.4, label: 'wander' }]);
         } else if (w.rect.x !== this.nap.rect.x || w.rect.y !== this.nap.rect.y) {
           this.s.pos = { x: this.s.pos.x + w.rect.x - this.nap.rect.x, y: this.s.pos.y + w.rect.y - this.nap.rect.y };
           this.nap.rect = w.rect;
         }
       }
       if (this.under) {
         const w = this.windows.find((x) => x.id === this.under!.id);
         const r = this.under.rect;
         if (!w || w.rect.x !== r.x || w.rect.y !== r.y || w.rect.w !== r.w || w.rect.h !== r.h) {
           // 숨은 창이 움직이거나 사라지면 즉시 나온다 (spec §6.6)
           this.under = null;
           this.s.layer = { kind: 'top' };
           if (this.s.behavior === 'hide') this.queue = [];
         }
       }
     }
     ```
  7. `run()`의 switch에 추가:
     ```ts
       case 'attach': {
         const w = this.windows.find((x) => x.id === task.windowId);
         this.nap = w ? { id: w.id, rect: w.rect } : null;
         return dt;
       }
       case 'detach':
         this.nap = null;
         return dt;
       case 'layer': {
         if (task.under === null) { this.under = null; this.s.layer = { kind: 'top' }; return dt; }
         const w = this.windows.find((x) => x.id === task.under);
         if (!w) { this.queue = this.queue.slice(0, 1); return dt; } // 창이 없어졌으면 숨기 포기 (이 작업만 남기고 비움)
         this.under = { id: w.id, rect: w.rect };
         this.s.layer = { kind: 'under', windowId: w.id };
         return dt;
       }
     ```
  8. `planNext()`의 `sleep`·`wander` 분기를 교체:
     ```ts
       case 'wander': {
         const h = chance(this.rng, 0.3) ? this.hideTarget() : null;
         if (!h) { this.queue.push({ t: 'walk', to: this.randomPoint(), run: false, label: 'wander' }); break; }
         const stay = range(this.rng, 10, 60);
         this.queue.push(
           { t: 'walk', to: h.outside, run: false, label: 'wander' },
           { t: 'layer', under: h.id },
           { t: 'walk', to: h.deep, run: false, label: 'hide' },
           ...(h.peek ? [{ t: 'walk', to: h.peek, run: false, label: 'hide' } as Task] : []),
           pose('loaf'),
           { t: 'hold', pose: 'loaf', left: stay, label: 'hide' },
           { t: 'walk', to: h.outside, run: false, label: 'wander' },
           { t: 'layer', under: null },
         );
         break;
       }
       case 'sleep': {
         const n = chance(this.rng, 0.5) ? this.napSpot() : null;
         const p: PoseName = chance(this.rng, 0.5) ? 'curl' : 'lieSide';
         if (n) {
           this.queue.push({ t: 'walk', to: n.spot, run: false, label: 'wander' }, { t: 'attach', windowId: n.id });
           rest(p, dur('sleep'));
           this.queue.push({ t: 'detach' });
         } else {
           this.queue.push({ t: 'walk', to: this.sleepSpot(), run: false, label: 'wander' });
           rest(p, dur('sleep'));
         }
         break;
       }
     ```
  9. 자리 고르기:
     ```ts
     /** 창 크기 조건: 너비 3·높이 2 몸길이 이상 */
     private bigEnough(r: Rect): boolean {
       const L = this.L();
       return r.w >= 3 * L && r.h >= 2 * L;
     }

     /** 제목 표시줄 위 낮잠 자리. 앞 창에 가려진 곳은 제외 */
     private napSpot(): { id: number; spot: Vec2 } | null {
       const L = this.L();
       const cands: { id: number; spot: Vec2 }[] = [];
       this.windows.forEach((w, i) => {
         if (!this.bigEnough(w.rect)) return;
         const r = w.rect;
         const spot = { x: r.x + 1.5 * L + this.rng.next() * (r.w - 3 * L), y: r.y + 0.25 * L };
         if (!monitorAt(spot, this.monitors)) return;
         if (this.windows.slice(0, i).some((f) => rectContains(f.rect, spot))) return;
         cands.push({ id: w.id, spot });
       });
       return cands.length ? cands[Math.floor(this.rng.next() * cands.length)] : null;
     }

     /** 숨을 가장자리(왼·오른·아래). 가장자리 점이 앞 창에 가려지지 않고, 바깥 접근점이 화면 안이어야 한다 */
     private hideTarget(): { id: number; outside: Vec2; deep: Vec2; peek: Vec2 | null } | null {
       const L = this.L();
       const cands: { id: number; outside: Vec2; deep: Vec2; peek: Vec2 | null }[] = [];
       this.windows.forEach((w, i) => {
         if (!this.bigEnough(w.rect)) return;
         const r = w.rect, front = this.windows.slice(0, i);
         const edges = [
           { x: r.x, y: r.y + r.h * (0.25 + this.rng.next() * 0.5), nx: -1, ny: 0 },
           { x: r.x + r.w, y: r.y + r.h * (0.25 + this.rng.next() * 0.5), nx: 1, ny: 0 },
           { x: r.x + r.w * (0.25 + this.rng.next() * 0.5), y: r.y + r.h, nx: 0, ny: 1 },
         ];
         for (const e of edges) {
           const at = (k: number) => ({ x: e.x + e.nx * k * L, y: e.y + e.ny * k * L }); // k > 0 바깥, k < 0 안쪽
           const outside = at(1);
           if (!monitorAt(outside, this.monitors) || front.some((f) => rectContains(f.rect, { x: e.x, y: e.y }))) continue;
           cands.push({ id: w.id, outside, deep: at(-1.3), peek: chance(this.rng, 0.3) ? at(-0.35) : null });
         }
       });
       return cands.length ? cands[Math.floor(this.rng.next() * cands.length)] : null;
     }
     ```

- [ ] **Step 3: 통과 확인** — Run: `pnpm test && pnpm typecheck` / Expected: 전체 PASS. 낮잠·숨기 테스트가 시드 범위 안에서 한 번도 안 일어나면 확률 분기(`chance(…, 0.5)`, `0.3`)와 크기 조건을 spec과 대조한다(시드 범위를 늘려 통과시키지 않는다).

- [ ] **Step 4: 커밋**
```bash
git add src/brain
git commit -m "feat: let Ber nap on window title bars and hide under window edges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 오버레이 연결 (창 목록 → 두뇌·가림막)

**Files:**
- Modify: `src/bridge.ts`, `src/overlay.ts`

**Interfaces:**
- Consumes: Task 1 `windows` 이벤트, Task 2 `rectToLocal`·`setOccluders`, Task 3 `CatState.layer`

- [ ] **Step 1: bridge** — `src/bridge.ts`에 추가 (import에 `WinInfo` 추가: `import type { MonitorInfo, Vec2, WinInfo } from './world';`):
```ts
  onWindows: (cb: (w: WinInfo[]) => void): Promise<UnlistenFn> => listen<WinInfo[]>('windows', (e) => cb(e.payload)),
```

- [ ] **Step 2: overlay** — `src/overlay.ts`:
  - import에 `rectToLocal`과 `type WinInfo` 추가.
  - `let receivedAt = 0;` 다음에 `let windows: WinInfo[] = [];`, 그리고 `await bridge.onCursor(...)` 앞에 `await bridge.onWindows((w) => { windows = w; });`
  - 두뇌 입력의 `windows: []`를 `windows`로.
  - `view.place(...)` 다음 줄에 가림막 설정:
    ```ts
      // 숨은 창과 그 앞의 창들이 베르를 가린다 (Review Focus 5)
      const layer = state.layer;
      const idx = layer.kind === 'under' ? windows.findIndex((w) => w.id === layer.windowId) : -1;
      view.setOccluders(idx >= 0 ? windows.slice(0, idx + 1).map((w) => rectToLocal(w.rect, me)) : []);
    ```
  Run: `pnpm typecheck && pnpm test` / Expected: 모두 PASS

- [ ] **Step 3: 실제 확인 (사용자 눈 확인)** — 활동량을 임시로 '활발하게'(트레이에서 선택)로 두고 `pnpm tauri dev`. 사용자에게 확인받는다:
  - 베르가 다른 앱 창의 제목 표시줄 위에서 잔다. 그 창을 드래그하면 같이 따라온다. 창을 닫으면 일어난다.
  - 가끔 창 왼쪽·오른쪽·아래 가장자리로 가서 그 창 밑으로 쏙 들어간다(들어간 부분이 창에 가려짐). 가끔 얼굴만 내민다. 잠시 뒤 나온다.
  - 숨어 있을 때 그 창을 움직이면 바로 창 위로 드러난다.
  - 가려진 부분을 클릭하면 베르가 아니라 그 창이 클릭된다.

- [ ] **Step 4: 커밋**
```bash
git add -A
git commit -m "feat: feed window list to the brain and mask Ber under covering windows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 계획 C 완료 기준
- `pnpm test`, `pnpm typecheck`, `cargo test` 전부 통과
- 낮잠·창 따라가기·내려오기·숨기·즉시 나오기·가림·가려진 곳 클릭 통과를 사용자가 확인
