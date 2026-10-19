# 계획 D: Windows 지원과 배포 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 베르가 Windows 10/11에서도 같은 동작을 하고, 가족이 `brew install --cask leekwang-min/tap/ber`(macOS)·`scoop install ber`(Windows)로 경고 없이 설치할 수 있게 한다.

**Architecture:** OS별로 달라지는 부분은 Rust `platform`(커서·모니터·창 목록)과 오버레이 창 스타일뿐이다. Windows 창 목록의 "사용자 창" 판정은 순수 함수로 두어 macOS에서도 테스트한다. 빌드는 GitHub Actions(macOS universal + Windows x64)가 태그마다 만들어 Releases에 올리고, Homebrew tap·Scoop bucket 레포의 매니페스트를 갱신한다.

**Tech Stack:** Rust (`windows` 0.62), Tauri 2 CLI, GitHub Actions, Homebrew cask, Scoop

**Spec:** `docs/superpowers/specs/2026-10-16-ber-desktop-cat-design.md` (§4 좌표계, §7.1 창 목록(Windows), §7.3 포커스, §8 성능, §9 배포)

**계획 시리즈:** A·B·C(완료) → **D(이 문서)**

## Global Constraints

- 계획 A~C의 Global Constraints 전부 유지.
- Windows 좌표: per-monitor DPI aware v2의 물리 픽셀 = 월드 좌표. 모니터 `cssPerWorld = 1 / scaleFactor`.
- Windows 창 목록(spec §7.1): `IsWindowVisible`, `!IsIconic`, `DWMWA_CLOAKED == 0`, `WS_EX_TOOLWINDOW` 아님, 소유 PID ≠ 자기, 크기 ≥ 80×40, 위치는 `DWMWA_EXTENDED_FRAME_BOUNDS`. 추가로 제목이 비어 있거나, 소유자 창이 있으면서 `WS_EX_APPWINDOW`가 없거나, 셸 창(`Shell_TrayWnd`·`Shell_SecondaryTrayWnd`·`Progman`·`WorkerW`)이면 제외.
- Windows 오버레이는 `WS_EX_NOACTIVATE`로 클릭해도 포커스를 뺏지 않는다.
- 배포물 이름: `Ber-<버전>-mac.zip`(Ber.app, universal, ad-hoc 서명), `Ber-<버전>-windows-x64.zip`(ber.exe), 각 `.sha256`.
- **외부 공개 작업(레포 생성·푸시·태그·릴리스·tap/bucket 게시)은 Task 5에서만 하고, 실행 전에 사용자에게 공개 범위와 라이선스를 확인받는다.**
- 쉬는 중 CPU 목표(spec §1·§8): 릴리스 빌드, Apple Silicon에서 ber + WebKit 보조 프로세스 합계 5% 미만.

## Review Focus

1. **Windows에서 크기 배율이 다른 모니터 두 대**(예: 100% + 150%) → 커서·창·베르 위치가 모든 모니터에서 맞아야 한다. 단위 테스트(world.ts)는 있지만 실제 확인은 가족 PC에서. Task 5 체크리스트.
2. **Windows의 숨은 UWP 창·작업 표시줄·바탕화면** → 베르가 그 위에서 자거나 밑에 숨으면 안 된다. Task 1 순수 판정 테스트.
3. **CSP를 켠 릴리스 빌드에서 인라인 부트 스크립트·Tauri IPC가 막힘** → 오류 보고 통로와 IPC가 그대로 동작해야 한다. Task 2에서 릴리스 실행 로그로 확인.
4. **brew/scoop로 설치·업데이트·삭제** → 경고 없이 실행되고, 삭제 시 로그인 항목·설정까지 정리돼야 한다(`zap`). Task 5에서 이 Mac으로 직접 확인.
5. **로그인 시 실행 후 업데이트** → 업데이트 뒤에도 같은 경로로 자동 실행돼야 한다(Scoop `current`, Homebrew `/Applications/Ber.app`). Task 5 체크리스트.

---

### Task 1: Windows 플랫폼 계층

**Files:**
- Modify: `src-tauri/src/window_list.rs` (Windows용 순수 판정 `is_user_window` + 테스트)
- Create: `src-tauri/src/platform/win.rs`
- Modify: `src-tauri/src/platform/mod.rs`, `src-tauri/src/overlay.rs`, `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: `window_list::{WinProps, is_user_window(&WinProps) -> bool}`; Windows에서 `platform::{monitors, cursor, raw_windows}`

- [ ] **Step 1: 실패하는 판정 테스트** — `src-tauri/src/window_list.rs`에 추가 (`is_user_window`는 `unimplemented!()`):
```rust
/// Windows 창의 속성 (win32 값을 그대로 옮긴 것). 판정은 아래 순수 함수가 한다.
#[derive(Clone, Debug, Default)]
pub struct WinProps {
    pub visible: bool,
    pub minimized: bool,
    pub cloaked: bool,
    pub ex_style: u32,
    pub has_owner: bool,
    pub title_len: i32,
    pub class: String,
}

const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const WS_EX_APPWINDOW: u32 = 0x0004_0000;
const SHELL_CLASSES: [&str; 4] = ["Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Progman", "WorkerW"];

/// 작업 전환(Alt+Tab)에 나오는 사용자 창인지 (spec §7.1 Windows)
pub fn is_user_window(_p: &WinProps) -> bool {
    unimplemented!()
}
```
  `mod tests` 안에 추가:
```rust
    fn app() -> WinProps {
        WinProps { visible: true, title_len: 5, class: "Chrome_WidgetWin_1".into(), ..WinProps::default() }
    }

    #[test]
    fn accepts_normal_app_windows_and_rejects_shell_cloaked_and_tool_windows() {
        assert!(is_user_window(&app()));
        assert!(!is_user_window(&WinProps { visible: false, ..app() }));
        assert!(!is_user_window(&WinProps { minimized: true, ..app() }));
        assert!(!is_user_window(&WinProps { cloaked: true, ..app() }));            // 숨은 UWP 창
        assert!(!is_user_window(&WinProps { title_len: 0, ..app() }));
        assert!(!is_user_window(&WinProps { ex_style: WS_EX_TOOLWINDOW, ..app() }));
        assert!(!is_user_window(&WinProps { has_owner: true, ..app() }));          // 소유된 팝업
        assert!(is_user_window(&WinProps { has_owner: true, ex_style: WS_EX_APPWINDOW, ..app() }));
        assert!(!is_user_window(&WinProps { class: "Shell_TrayWnd".into(), ..app() })); // 작업 표시줄
        assert!(!is_user_window(&WinProps { class: "WorkerW".into(), ..app() }));       // 바탕화면
    }
```
  Run: `(cd src-tauri && cargo test window_list)` / Expected: 새 테스트 FAILED (`not implemented`)

- [ ] **Step 2: 판정 구현**
```rust
pub fn is_user_window(p: &WinProps) -> bool {
    p.visible
        && !p.minimized
        && !p.cloaked
        && p.title_len > 0
        && p.ex_style & WS_EX_TOOLWINDOW == 0
        && (!p.has_owner || p.ex_style & WS_EX_APPWINDOW != 0)
        && !SHELL_CLASSES.contains(&p.class.as_str())
}
```
  Run: `(cd src-tauri && cargo test window_list)` / Expected: PASS

- [ ] **Step 3: Windows 구현** — `src-tauri/Cargo.toml`에 추가:
```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.62", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging", "Win32_Graphics_Dwm"] }
```
  `src-tauri/src/platform/win.rs`:
```rust
// Windows: per-monitor DPI aware v2의 물리 픽셀 전역 좌표 = 월드 좌표 (GetCursorPos·DWM 프레임과 같은 좌표계)
use crate::geometry::{MonitorInfo, Point, Rect};
use crate::window_list::{is_user_window, RawWindow, WinProps};
use tauri::AppHandle;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetCursorPos, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, GWL_EXSTYLE, GW_OWNER,
};

pub fn monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let (p, s) = (*m.position(), *m.size());
            MonitorInfo {
                id: format!("{}:{}", p.x, p.y),
                rect: Rect { x: p.x as f64, y: p.y as f64, w: s.width as f64, h: s.height as f64 },
                css_per_world: 1.0 / m.scale_factor(),
                primary: Some(p) == primary,
            }
        })
        .collect()
}

pub fn cursor(_app: &AppHandle) -> Option<Point> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some(Point { x: p.x as f64, y: p.y as f64 })
}

/// EnumWindows는 위(앞)→아래(뒤) 순서로 돈다
pub fn raw_windows() -> Vec<RawWindow> {
    let mut out: Vec<RawWindow> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut out as *mut Vec<RawWindow> as isize));
    }
    out
}

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = &mut *(lparam.0 as *mut Vec<RawWindow>);
    let mut class = [0u16; 64];
    let n = GetClassNameW(hwnd, &mut class);
    let props = WinProps {
        visible: IsWindowVisible(hwnd).as_bool(),
        minimized: IsIconic(hwnd).as_bool(),
        cloaked: dwm_u32(hwnd, DWMWA_CLOAKED) != 0,
        ex_style: GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32,
        has_owner: GetWindow(hwnd, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false),
        title_len: GetWindowTextLengthW(hwnd),
        class: String::from_utf16_lossy(&class[..n.max(0) as usize]),
    };
    if is_user_window(&props) {
        let mut r = RECT::default();
        let ok = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &mut r as *mut RECT as *mut _, std::mem::size_of::<RECT>() as u32).is_ok();
        if ok {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            out.push(RawWindow {
                id: hwnd.0 as usize as u64,
                pid: pid as i64,
                layer: 0,
                alpha: 1.0,
                rect: Rect { x: r.left as f64, y: r.top as f64, w: (r.right - r.left) as f64, h: (r.bottom - r.top) as f64 },
            });
        }
    }
    BOOL(1) // 계속 열거
}

unsafe fn dwm_u32(hwnd: HWND, attr: windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE) -> u32 {
    let mut v = 0u32;
    let _ = DwmGetWindowAttribute(hwnd, attr, &mut v as *mut u32 as *mut _, 4);
    v
}
```
  `src-tauri/src/platform/mod.rs`를:
```rust
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(windows)]
mod win;
#[cfg(windows)]
pub use win::*;

#[cfg(not(any(target_os = "macos", windows)))]
mod fallback;
#[cfg(not(any(target_os = "macos", windows)))]
pub use fallback::*;
```
  `src-tauri/src/overlay.rs`의 `create()`에서 `w.set_ignore_cursor_events(true)?;` 앞에 추가:
```rust
    // Windows: 클릭해도 포커스를 뺏지 않는다 (spec §7.3)
    #[cfg(windows)]
    if let Ok(hwnd) = w.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};
        unsafe {
            let h = HWND(hwnd.0 as _); // tauri가 쓰는 windows 크레이트 버전과 달라도 원시 포인터로 넘긴다
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
        }
    }
```

- [ ] **Step 4: Windows 대상 컴파일 확인** — Run: `rustup target add x86_64-pc-windows-msvc && (cd src-tauri && cargo check --target x86_64-pc-windows-msvc)` / Expected: 성공. 빌드 스크립트(리소스 컴파일 등)가 macOS에서 Windows 대상으로 돌지 못해 실패하면, 그 실패가 빌드 스크립트 때문인지(우리 코드가 아님) 로그로 확인하고 Task 3의 CI(windows-latest)에서 컴파일을 확인하는 것으로 대신한다. 우리 코드의 API 이름 오류는 여기서 docs.rs `windows` 0.62 문서로 고친다.

- [ ] **Step 5: macOS 회귀 확인과 커밋** — Run: `pnpm test && (cd src-tauri && cargo test)` / Expected: 모두 PASS
```bash
git add -A
git commit -m "feat: add Windows cursor, monitor and window-list support

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: CSP·릴리스 빌드·CPU 재측정

**Files:**
- Modify: `src-tauri/tauri.conf.json`, `src/overlay.ts` (히트 판정 주기 제한)

- [ ] **Step 1: CSP 켜기** — `src-tauri/tauri.conf.json`의 `"security": { "csp": null }`를:
```json
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src ipc: http://ipc.localhost"
    }
```
  (Tauri는 빌드한 HTML의 인라인 스크립트 해시를 CSP에 자동으로 넣는다. 인라인 `<style>`과 JS의 `element.style`을 위해 style은 `unsafe-inline`.)

- [ ] **Step 2: 쓰다듬는 동안의 히트 판정 비용 줄이기** — `src/overlay.ts`의 tick 안 `updateClickThrough(); // 멈춘 커서 밑으로…` 줄을:
```ts
      // 멈춘 커서 밑으로 베르가 오가도 클릭 통과를 다시 판정한다 (최대 15Hz — 히트 판정이 호출당 ~1ms)
      if (now - lastHitCheck > 66) { lastHitCheck = now; updateClickThrough(); }
```
  로 바꾸고, `let last = performance.now(), lastSent = …` 줄에 `, lastHitCheck = 0`을 추가한다. (커서 이벤트 때의 즉시 판정은 그대로)

- [ ] **Step 3: 릴리스 빌드** — Run: `pnpm tauri build --bundles app` / Expected: `src-tauri/target/release/bundle/macos/Ber.app` 생성. `codesign -dv` 결과 `Signature=adhoc`.

- [ ] **Step 4: 릴리스 실행과 로그 확인 (Review Focus 3)** — Run (백그라운드): `src-tauri/target/release/bundle/macos/Ber.app/Contents/MacOS/ber 2> /tmp/ber-release.log` / Expected: 로그에 `[overlay-…] boot`과 `overlay start …`가 모니터 수만큼. CSP 위반이나 `early error`가 없어야 한다. 막히면 CSP를 고친다.

- [ ] **Step 5: 쉬는 중 CPU·메모리 측정** — 베르가 식빵/잠 상태일 때(시작 후 처음 5~15초는 식빵), ber와 최근 시작된 WebKit 보조 프로세스의 CPU를 `top -l 6 -s 2`로, 메모리를 `footprint`로 잰다. Expected: 합계 CPU 5% 미만(spec §8). 넘으면 원인을 측정으로 좁혀 고치고(예: 쉬는 중 REST_FPS를 15→10), 숫자를 ledger에 남긴다.

- [ ] **Step 6: 커밋**
```bash
git add -A
git commit -m "chore: enable CSP and throttle hit testing; verify release build

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: GitHub Actions (CI·릴리스)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: CI** — `.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: cargo test --manifest-path src-tauri/Cargo.toml
      - run: pnpm tauri build --no-bundle
```

- [ ] **Step 2: 릴리스** — `.github/workflows/release.yml`:
```yaml
name: release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
          - os: windows-latest
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ runner.os == 'macOS' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}
      - run: pnpm install --frozen-lockfile

      - name: build (macOS universal)
        if: runner.os == 'macOS'
        run: |
          pnpm tauri build --target universal-apple-darwin --bundles app
          V="${GITHUB_REF_NAME#v}"
          ditto -c -k --keepParent "src-tauri/target/universal-apple-darwin/release/bundle/macos/Ber.app" "Ber-$V-mac.zip"
          shasum -a 256 "Ber-$V-mac.zip" | cut -d' ' -f1 > "Ber-$V-mac.zip.sha256"

      - name: build (Windows x64)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          pnpm tauri build --no-bundle
          $v = "$env:GITHUB_REF_NAME".TrimStart('v')
          Compress-Archive -Path src-tauri/target/release/ber.exe -DestinationPath "Ber-$v-windows-x64.zip"
          (Get-FileHash "Ber-$v-windows-x64.zip" -Algorithm SHA256).Hash.ToLower() | Out-File -NoNewline -Encoding ascii "Ber-$v-windows-x64.zip.sha256"

      - uses: softprops/action-gh-release@v2
        with:
          files: |
            Ber-*.zip
            Ber-*.zip.sha256
```

- [ ] **Step 3: 문법 확인과 커밋** — Run: `npx --yes yaml@2.6.1 valid < .github/workflows/ci.yml && npx --yes yaml@2.6.1 valid < .github/workflows/release.yml` / Expected: 오류 없음 (워크플로 의미 검증은 Task 5의 실제 실행으로)
```bash
git add .github
git commit -m "ci: test on macOS and Windows; build and publish release zips on tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 설치 안내·매니페스트·릴리스 스크립트

**Files:**
- Create: `README.md`, `packaging/homebrew/ber.rb`, `packaging/scoop/ber.json`, `scripts/release.sh`

- [ ] **Step 1: Homebrew cask 템플릿** — `packaging/homebrew/ber.rb` (`@VERSION@`·`@SHA256@`는 `scripts/release.sh`가 채운다):
```ruby
cask "ber" do
  version "@VERSION@"
  sha256 "@SHA256@"

  url "https://github.com/LeeKwang-min/desktop-ber/releases/download/v#{version}/Ber-#{version}-mac.zip"
  name "Ber"
  name "베르"
  desc "화면 위를 돌아다니는 턱시도 고양이 베르"
  homepage "https://github.com/LeeKwang-min/desktop-ber"

  depends_on macos: ">= :sonoma"

  app "Ber.app"

  # 공증하지 않은 앱이라 설치 직후 격리 표시를 지워 Gatekeeper 경고 없이 실행되게 한다
  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Ber.app"]
  end

  uninstall quit: "com.leekwangmin.ber"

  zap trash: [
    "~/Library/Application Support/com.leekwangmin.ber",
    "~/Library/Caches/com.leekwangmin.ber",
    "~/Library/WebKit/com.leekwangmin.ber",
    "~/Library/LaunchAgents/Ber.plist",
  ]
end
```

- [ ] **Step 2: Scoop 매니페스트 템플릿** — `packaging/scoop/ber.json`:
```json
{
  "version": "@VERSION@",
  "description": "화면 위를 돌아다니는 턱시도 고양이 베르",
  "homepage": "https://github.com/LeeKwang-min/desktop-ber",
  "license": "@LICENSE@",
  "architecture": {
    "64bit": {
      "url": "https://github.com/LeeKwang-min/desktop-ber/releases/download/v@VERSION@/Ber-@VERSION@-windows-x64.zip",
      "hash": "@SHA256@"
    }
  },
  "shortcuts": [["ber.exe", "베르"]],
  "checkver": "github",
  "autoupdate": {
    "architecture": {
      "64bit": {
        "url": "https://github.com/LeeKwang-min/desktop-ber/releases/download/v$version/Ber-$version-windows-x64.zip"
      }
    }
  }
}
```

- [ ] **Step 3: 릴리스 스크립트** — `scripts/release.sh`:
```bash
#!/usr/bin/env bash
# 사용법: scripts/release.sh 0.1.1
#  1) 버전 갱신 → 커밋 → 태그 → 푸시
#  2) GitHub Actions 릴리스가 끝나길 기다림
#  3) 릴리스의 SHA-256으로 homebrew-tap / scoop-bucket 매니페스트를 갱신해 각 레포에 푸시
set -euo pipefail
V="${1:?버전을 주세요 (예: 0.1.1)}"
OWNER=LeeKwang-min
LICENSE_ID="${LICENSE_ID:-MIT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node -e "for (const f of ['package.json','src-tauri/tauri.conf.json']) { const j=require('./'+f); j.version='$V'; require('fs').writeFileSync(f, JSON.stringify(j,null,2)+'\n'); }"
node -e "const fs=require('fs'),f='src-tauri/Cargo.toml'; fs.writeFileSync(f, fs.readFileSync(f,'utf8').replace(/^version = \".*\"$/m, 'version = \"$V\"'))"
(cd src-tauri && cargo update -p ber --offline >/dev/null 2>&1 || true)
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: release v$V"
git tag "v$V"
git push origin main "v$V"

echo "릴리스 빌드를 기다립니다..."
sleep 10
RUN_ID="$(gh run list --repo "$OWNER/desktop-ber" --workflow release.yml --branch "v$V" --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" --repo "$OWNER/desktop-ber" --exit-status

TMP="$(mktemp -d)"
gh release download "v$V" --repo "$OWNER/desktop-ber" --pattern '*.sha256' --dir "$TMP"
MAC_SHA="$(cat "$TMP/Ber-$V-mac.zip.sha256")"
WIN_SHA="$(cat "$TMP/Ber-$V-windows-x64.zip.sha256")"

gh repo clone "$OWNER/homebrew-tap" "$TMP/tap" -- --depth 1
mkdir -p "$TMP/tap/Casks"
sed -e "s/@VERSION@/$V/g" -e "s/@SHA256@/$MAC_SHA/g" packaging/homebrew/ber.rb > "$TMP/tap/Casks/ber.rb"
git -C "$TMP/tap" add Casks/ber.rb && git -C "$TMP/tap" commit -m "ber $V" && git -C "$TMP/tap" push

gh repo clone "$OWNER/scoop-bucket" "$TMP/bucket" -- --depth 1
mkdir -p "$TMP/bucket/bucket"
sed -e "s/@VERSION@/$V/g" -e "s/@SHA256@/$WIN_SHA/g" -e "s/@LICENSE@/$LICENSE_ID/g" packaging/scoop/ber.json > "$TMP/bucket/bucket/ber.json"
git -C "$TMP/bucket" add bucket/ber.json && git -C "$TMP/bucket" commit -m "ber $V" && git -C "$TMP/bucket" push

echo "완료: v$V (mac $MAC_SHA / windows $WIN_SHA)"
```
  Run: `chmod +x scripts/release.sh && bash -n scripts/release.sh` / Expected: 문법 오류 없음

- [ ] **Step 4: README (가족용 설치 안내)** — `README.md`:
````markdown
# 베르 (Ber)

화면 위를 돌아다니는 검은 턱시도 고양이 **베르**. 대부분 자거나 식빵을 굽고, 가끔 일어나 돌아다니며, 커서를 쫓고, 쓰다듬으면 골골송을 부릅니다. 다른 앱 창의 제목 표시줄 위에서 자기도 하고 창 밑에 숨기도 해요.

## 설치

### macOS (14 이상)
1. [Homebrew](https://brew.sh/ko/)가 없다면 터미널에 붙여넣기:
   ```
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. 베르 설치:
   ```
   brew install --cask leekwang-min/tap/ber
   ```
3. 응용 프로그램에서 **베르**를 실행하면 메뉴바에 고양이 얼굴 아이콘이 생깁니다.

### Windows 10/11
1. 시작 메뉴에서 **PowerShell**을 열고 Scoop 설치(처음 한 번):
   ```
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```
2. 베르 설치:
   ```
   scoop bucket add ber https://github.com/LeeKwang-min/scoop-bucket
   scoop install ber
   ```
3. 시작 메뉴의 **베르**를 실행하면 작업 표시줄 알림 영역에 아이콘이 생깁니다.

## 업데이트·삭제
| | macOS | Windows |
|---|---|---|
| 업데이트 | `brew upgrade --cask ber` | `scoop update ber` |
| 삭제 | `brew uninstall --cask ber` (설정까지: `--zap`) | `scoop uninstall ber` |

## 메뉴
메뉴바(Windows는 알림 영역)의 베르 아이콘:
- **이리 와** — 커서 쪽으로 달려와 앉아요
- **숨기기 / 보이기**
- **활동량** — 실제 고양이처럼(기본) / 반반 / 활발하게
- **크기** — 작게 / 보통 / 크게
- **로그인 시 실행**
- **종료**

## 알아두기
- 베르 위가 아닌 곳의 클릭은 아래 앱으로 그대로 갑니다.
- macOS에서는 베르를 클릭하면 포커스가 잠깐 베르로 넘어갑니다. 하던 창을 다시 클릭하면 돼요.
- 전체화면 앱(영상 등) 위에서는 베르가 보이지 않을 수 있어요.
- Windows "스마트 앱 컨트롤"이 켜진 PC에서는 서명되지 않은 앱이라 실행이 막힐 수 있습니다.

## 개발
```
pnpm install
pnpm tauri dev          # 앱 실행
pnpm dev                # 브라우저에서 http://localhost:1420/?gallery 로 자세 갤러리
pnpm test && (cd src-tauri && cargo test)
```
설계: `docs/superpowers/specs/2026-10-16-ber-desktop-cat-design.md`
````

- [ ] **Step 5: 커밋**
```bash
git add -A
git commit -m "docs: add family install guide, packaging templates and release script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 공개·첫 릴리스 (외부 공개 — 실행 전 사용자 확인 필수)

- [ ] **Step 1: 사용자 확인 (AskUserQuestion)** — 다음을 묻는다: ① `desktop-ber` 레포 공개 범위(Homebrew/Scoop가 인증 없이 받으려면 릴리스가 공개여야 함 → 공개 권장), ② 라이선스(MIT 권장 — 공개 레포와 Scoop 매니페스트에 필요), ③ `homebrew-tap`·`scoop-bucket` 레포를 개인 계정에 새로 만드는 것. 거절하면 여기서 멈추고 로컬 빌드 방법만 안내한다.

- [ ] **Step 2: 라이선스 파일** — 선택한 라이선스로 `LICENSE` 작성(MIT면 저작권자 `LeeKwang-min`, 연도 2026), `package.json`에 `"license"` 필드. 커밋.

- [ ] **Step 3: 레포 생성과 푸시** — Run:
```bash
gh repo create LeeKwang-min/desktop-ber --public --source . --remote origin --description "화면 위를 돌아다니는 턱시도 고양이 베르" --push
gh repo create LeeKwang-min/homebrew-tap --public --description "Homebrew tap (베르)" --add-readme
gh repo create LeeKwang-min/scoop-bucket --public --description "Scoop bucket (베르)" --add-readme
```
  Expected: 세 레포 생성, `main` 푸시. CI(`ci.yml`)가 macOS·Windows 둘 다 통과할 때까지 `gh run watch`로 기다린다. Windows에서 실패하면(주로 Task 1의 win32 API 이름) 로그를 보고 고쳐 다시 푸시한다.

- [ ] **Step 4: 첫 릴리스** — Run: `LICENSE_ID=MIT scripts/release.sh 0.1.0` / Expected: 릴리스에 zip 2개 + sha256 2개, tap·bucket에 매니페스트 커밋.

- [ ] **Step 5: 이 Mac에서 설치 확인 (Review Focus 4)** — 개발 중인 앱을 끄고 Run: `brew install --cask leekwang-min/tap/ber && open -a Ber` / Expected: 경고 없이 실행, 메뉴바 아이콘. "로그인 시 실행"을 켜고 `ls ~/Library/LaunchAgents | grep -i ber`로 등록 확인. `brew uninstall --zap --cask ber` 후 LaunchAgent·설정이 정리되는지 확인. 사용자에게 화면 동작을 한 번 더 확인받는다.

- [ ] **Step 6: Windows 확인 안내** — 사용자에게 README의 Windows 설치 안내와 확인 체크리스트를 전달한다(가족 PC에서): 설치 시 경고 없음 / 알림 영역 아이콘 / 베르가 걷고 잠 / 클릭 통과 / 베르 클릭 시 포커스를 뺏지 않음 / 창 위 낮잠·창 밑 숨기 / 배율이 다른 모니터 두 대에서 위치가 맞음(Review Focus 1) / 로그인 시 실행 후 `scoop update ber` 뒤에도 자동 실행(Review Focus 5).

## 계획 D 완료 기준
- CI가 macOS·Windows에서 통과, 태그 하나로 두 OS 배포물이 Releases에 올라감
- 이 Mac에서 brew로 설치·실행·삭제가 경고 없이 됨
- 가족 Windows PC 확인은 사용자가 체크리스트로 진행
