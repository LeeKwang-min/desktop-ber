# 계획 A: 베르가 macOS 화면을 돌아다닌다 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모니터마다 클릭이 통과하는 투명 오버레이를 띄우고, 코드로 만든 3D 베르가 활동량 프리셋에 따라 걷고·식빵 굽고·자고·그루밍하고·배까기하며 여러 모니터를 오가게 한다 (macOS).

**Architecture:** Tauri 2 앱. Rust는 모니터/커서 조회와 오버레이 창 생성만 담당하고 이벤트로 방송한다. 주 모니터 웹뷰의 순수 TS 두뇌(`Brain`)가 베르 상태를 계산해 `cat-state` 이벤트로 방송하고, 각 웹뷰는 자기 모니터에 베르가 있으면 three.js로 그린다.

**Tech Stack:** Tauri 2.12, TypeScript (strict), Vite 8, three.js 0.186, vitest 5, Rust (core-graphics 0.25)

**Spec:** `docs/superpowers/specs/2026-10-16-ber-desktop-cat-design.md`

**계획 시리즈:** A(마일스톤 1~3, 이 문서) → B(4~5: 커서·클릭·트레이·창) → C(6~7: Windows·배포). B와 C는 A 완료 후 실제 API 동작을 반영해 작성한다.

## Global Constraints

- Tauri는 2.x 안정판만 사용 (`tauri = "2"`, `@tauri-apps/api ^2.12`). 3.0 알파 금지.
- 번들 ID `com.leekwangmin.ber`, productName `Ber`, 표시 이름 `베르`, macOS 최소 14.0.
- `src/world.ts`, `src/brain/**`, `src/cat/graph.ts`는 three.js·Tauri를 import하지 않는다 (순수 TS, vitest 대상).
- Tauri 의존은 `src/bridge.ts` 한 곳에만 둔다.
- 외형 파라미터는 spec §5.1 값 그대로 (`src/cat/params.ts`).
- 카메라 기울기 38°, 직교 투영. 바닥점 `(x, 0, y / cos38°)`가 화면 CSS 좌표 `(x, y)`에 온다.
- 몸 길이(CSS px): 작게 90 / 보통 130 / 크게 180. 계획 A는 보통(130) 고정.
- 사용자에게 보이는 문자열은 한국어.
- 커밋 메시지는 Conventional Commits, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **음수 좌표 모니터 배치** (보조 모니터가 주 모니터의 왼쪽/위쪽) → 좌표 변환과 끌어오기가 올바라야 한다. Task 2 테스트로 고정.
2. **베르가 있던 모니터가 분리됨** → 다음 스텝에서 남은 모니터 안으로 옮겨져야 한다. Task 6 테스트로 고정.
3. **잠자기/깨우기 후 거대한 dt** (예: 30초) → 순간이동해서 모니터 밖으로 나가거나 NaN이 생기면 안 된다. Task 6 테스트로 고정 (+ 루프에서 dt 상한 0.1초).
4. **시작 직후 모니터 목록이 비어 있음** → 두뇌가 예외 없이 생성·진행되고 가만히 있어야 한다. Task 6 테스트로 고정.
5. **장시간 실행** (2시간 시뮬레이션) → 위치가 항상 모니터 합집합 안, 방향이 유한값. Task 6 테스트로 고정.

---

## File Structure

```
desktop-ber/
├─ package.json, tsconfig.json, vite.config.ts, index.html
├─ scripts/make-icon.mjs            의존성 없는 PNG 아이콘 생성기
├─ assets/app-icon.png              (생성물) tauri icon 입력
├─ src/
│  ├─ main.ts                       ?gallery면 갤러리, 아니면 오버레이
│  ├─ bridge.ts                     Tauri 이벤트/명령 래퍼
│  ├─ world.ts (+ world.test.ts)    좌표·사각형·모니터 유틸
│  ├─ overlay.ts                    오버레이 웹뷰 루프 (brain/viewer 역할)
│  ├─ render.ts                     CatView: three.js 렌더러·카메라·그림자·scissor
│  ├─ gallery.ts                    개발용 자세 갤러리
│  ├─ brain/
│  │  ├─ rng.ts (+ rng.test.ts)
│  │  ├─ presets.ts (+ presets.test.ts)
│  │  └─ brain.ts (+ brain.test.ts)
│  └─ cat/
│     ├─ graph.ts (+ graph.test.ts) 자세 이름·전환 그래프
│     ├─ params.ts                  확정 외형 파라미터
│     ├─ model.ts                   메시·뼈대 생성
│     ├─ poses.ts (+ poses.test.ts) 자세 데이터·보간
│     └─ animator.ts                자세 전환·보행·덧씌우기 → 뼈대 적용
└─ src-tauri/
   ├─ Cargo.toml, build.rs, tauri.conf.json, Info.plist
   ├─ capabilities/default.json
   └─ src/
      ├─ main.rs, lib.rs
      ├─ geometry.rs                Rect/Point/MonitorInfo
      ├─ overlay.rs                 모니터별 오버레이 창
      ├─ poller.rs                  커서·모니터 폴링 → 이벤트
      ├─ tray.rs                    트레이 (계획 A: 종료만)
      └─ platform/
         ├─ mod.rs
         ├─ macos.rs                CGDisplay·CGEvent
         └─ fallback.rs             비-macOS 임시 구현 (계획 C에서 교체)
```

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
- Create: `scripts/make-icon.mjs`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/Info.plist`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `pnpm dev`(Vite :1420), `pnpm test`, `pnpm typecheck`, `pnpm tauri ...` 스크립트. Rust 크레이트 `ber_lib::run()`.

- [ ] **Step 1: 프론트엔드 설정 파일 작성**

`package.json`:
```json
{
  "name": "desktop-ber",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "icon": "node scripts/make-icon.mjs && tauri icon assets/app-icon.png",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.12.4",
    "three": "^0.186.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.12.3",
    "@types/three": "^0.186.0",
    "typescript": "^5.9.0",
    "vite": "^8.3.4",
    "vitest": "^5.0.5"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022' },
});
```

`index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>베르</title>
    <style>
      html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
      #c { display: block; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <canvas id="c"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts` (임시 — Task 3에서 교체):
```ts
console.log('ber boot');
```

- [ ] **Step 2: 아이콘 생성기 작성**

`scripts/make-icon.mjs` — 의존성 없이 베르 얼굴(검은 머리·귀, 흰 주둥이, 연두 눈)을 1024px PNG로 그린다. 4×4 슈퍼샘플링으로 안티앨리어싱.
```js
// 베르 얼굴 아이콘을 assets/app-icon.png (1024x1024, 투명 배경)로 그린다. 외부 의존성 없음.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const S = 1024, SS = 4;
const FUR = [35, 37, 43], WHITE = [244, 243, 238], IRIS = [197, 214, 61], PUPIL = [12, 12, 14], SHINE = [255, 255, 255];

const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inTri = (x, y, [ax, ay], [bx, by], [cx, cy]) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

// 위에 그린 것이 우선: 배열 뒤쪽이 위
const layers = [
  [FUR, (x, y) => inTri(x, y, [250, 420], [330, 120], [470, 330]) || inTri(x, y, [774, 420], [694, 120], [554, 330])],
  [FUR, (x, y) => inEllipse(x, y, 512, 560, 360, 320)],
  [WHITE, (x, y) => inEllipse(x, y, 512, 760, 120, 80)],
  [WHITE, (x, y) => inEllipse(x, y, 450, 700, 80, 62) || inEllipse(x, y, 574, 700, 80, 62)],
  [FUR, (x, y) => inEllipse(x, y, 512, 668, 34, 24)],
  [IRIS, (x, y) => inEllipse(x, y, 380, 540, 70, 76) || inEllipse(x, y, 644, 540, 70, 76)],
  [PUPIL, (x, y) => inEllipse(x, y, 380, 548, 28, 62) || inEllipse(x, y, 644, 548, 28, 62)],
  [SHINE, (x, y) => inEllipse(x, y, 402, 508, 16, 16) || inEllipse(x, y, 666, 508, 16, 16)],
];

const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
    let col = null;
    for (const [c, hit] of layers) if (hit(fx, fy)) col = c;
    if (col) { r += col[0]; g += col[1]; b += col[2]; a += 1; }
  }
  const i = (y * S + x) * 4, n = SS * SS;
  if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
  px[i + 3] = Math.round((a / n) * 255);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('assets', { recursive: true });
writeFileSync('assets/app-icon.png', png);
console.log('wrote assets/app-icon.png');
```

- [ ] **Step 3: Tauri(Rust) 설정 파일 작성**

`src-tauri/Cargo.toml`:
```toml
[package]
name = "ber"
version = "0.1.0"
edition = "2021"

[lib]
name = "ber_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(target_os = "macos")'.dependencies]
core-graphics = "0.25"
```

`src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Ber",
  "version": "0.1.0",
  "identifier": "com.leekwangmin.ber",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["app"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
    "macOS": { "signingIdentity": "-", "minimumSystemVersion": "14.0" }
  }
}
```

`src-tauri/Info.plist` (Tauri가 번들 Info.plist에 병합):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>베르</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
```

`src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "오버레이 창 권한",
  "windows": ["overlay-*"],
  "permissions": ["core:default", "core:window:allow-set-ignore-cursor-events"]
}
```

`src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ber_lib::run()
}
```

`src-tauri/src/lib.rs` (임시 — Task 3에서 확장):
```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Ber");
}
```

- [ ] **Step 4: 설치·아이콘 생성·빌드 확인**

Run:
```bash
pnpm install
pnpm icon
pnpm typecheck
(cd src-tauri && cargo check)
```
Expected: `wrote assets/app-icon.png`, `src-tauri/icons/`에 icns·ico·png 생성, typecheck 오류 없음, `cargo check` 성공(첫 실행은 수 분 소요).

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + Vite + three.js project with generated icon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 좌표·모니터 유틸 (`world.ts`)

**Files:**
- Create: `src/world.ts`
- Test: `src/world.test.ts`

**Interfaces:**
- Produces:
  - 타입 `Vec2 {x,y}`, `Rect {x,y,w,h}`, `MonitorInfo {id: string; rect: Rect; cssPerWorld: number; primary: boolean}`, `WinInfo {id: number; rect: Rect}`
  - `dist(a: Vec2, b: Vec2): number`
  - `worldToLocal(p: Vec2, m: MonitorInfo): Vec2`, `localToWorld(p: Vec2, m: MonitorInfo): Vec2`
  - `rectContains(r: Rect, p: Vec2): boolean`, `rectsIntersect(a: Rect, b: Rect): boolean`, `inset(r: Rect, d: number): Rect`
  - `monitorAt(p: Vec2, ms: MonitorInfo[]): MonitorInfo | null`
  - `clampToMonitors(p: Vec2, ms: MonitorInfo[], margin: number): Vec2`
  - `bodyLenWorld(bodyLengthCss: number, m: MonitorInfo | null): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/world.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { worldToLocal, localToWorld, monitorAt, clampToMonitors, inset, rectsIntersect, bodyLenWorld, type MonitorInfo } from './world';

const main: MonitorInfo = { id: '1', rect: { x: 0, y: 0, w: 1920, h: 1080 }, cssPerWorld: 1, primary: true };
const left: MonitorInfo = { id: '2', rect: { x: -1920, y: 0, w: 1920, h: 1080 }, cssPerWorld: 1, primary: false };
const above: MonitorInfo = { id: '3', rect: { x: 0, y: -1440, w: 2560, h: 1440 }, cssPerWorld: 1, primary: false };
const win150: MonitorInfo = { id: '4', rect: { x: 2560, y: 0, w: 3840, h: 2160 }, cssPerWorld: 1 / 1.5, primary: false };

describe('world', () => {
  it('converts world to local css px for negative-origin monitors', () => {
    expect(worldToLocal({ x: -1000, y: 50 }, left)).toEqual({ x: 920, y: 50 });
    expect(worldToLocal({ x: 10, y: -1400 }, above)).toEqual({ x: 10, y: 40 });
  });

  it('applies cssPerWorld for scaled monitors and round-trips', () => {
    const l = worldToLocal({ x: 2560 + 300, y: 150 }, win150);
    expect(l.x).toBeCloseTo(200);
    expect(l.y).toBeCloseTo(100);
    const w = localToWorld(l, win150);
    expect(w.x).toBeCloseTo(2860);
    expect(w.y).toBeCloseTo(150);
  });

  it('finds the monitor under a point, including negative coordinates', () => {
    const ms = [main, left, above];
    expect(monitorAt({ x: -5, y: 10 }, ms)?.id).toBe('2');
    expect(monitorAt({ x: 100, y: -5 }, ms)?.id).toBe('3');
    expect(monitorAt({ x: 5000, y: 10 }, ms)).toBeNull();
  });

  it('clamps points into the nearest monitor, inset by margin', () => {
    expect(clampToMonitors({ x: 2000, y: 500 }, [main, left], 100)).toEqual({ x: 1820, y: 500 });
    expect(clampToMonitors({ x: -3000, y: -50 }, [main, left], 100)).toEqual({ x: -1820, y: 100 });
    expect(clampToMonitors({ x: 500, y: 500 }, [main], 100)).toEqual({ x: 500, y: 500 });
    expect(clampToMonitors({ x: 5, y: 5 }, [], 100)).toEqual({ x: 5, y: 5 });
  });

  it('insets without inverting tiny rects', () => {
    expect(inset({ x: 0, y: 0, w: 100, h: 40 }, 30)).toEqual({ x: 30, y: 20, w: 40, h: 0 });
  });

  it('detects rect intersection', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it('converts body length from css px to world units', () => {
    expect(bodyLenWorld(130, main)).toBe(130);
    expect(bodyLenWorld(130, win150)).toBeCloseTo(195);
    expect(bodyLenWorld(130, null)).toBe(130);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/world.test.ts`
Expected: FAIL — `Failed to resolve import "./world"`

- [ ] **Step 3: 구현**

`src/world.ts`:
```ts
// 좌표 규칙: "월드" = OS가 창 위치를 보고하는 전역 좌표(좌상단 원점, y 아래로).
// macOS는 포인트, Windows는 물리 픽셀. 각 모니터의 cssPerWorld로 웹뷰 CSS px로 바꾼다.

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface MonitorInfo { id: string; rect: Rect; cssPerWorld: number; primary: boolean }
export interface WinInfo { id: number; rect: Rect }

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function worldToLocal(p: Vec2, m: MonitorInfo): Vec2 {
  return { x: (p.x - m.rect.x) * m.cssPerWorld, y: (p.y - m.rect.y) * m.cssPerWorld };
}

export function localToWorld(p: Vec2, m: MonitorInfo): Vec2 {
  return { x: p.x / m.cssPerWorld + m.rect.x, y: p.y / m.cssPerWorld + m.rect.y };
}

export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function inset(r: Rect, d: number): Rect {
  const dx = Math.min(d, r.w / 2), dy = Math.min(d, r.h / 2);
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy };
}

export function monitorAt(p: Vec2, ms: MonitorInfo[]): MonitorInfo | null {
  return ms.find((m) => rectContains(m.rect, p)) ?? null;
}

/** 모니터들을 margin만큼 안쪽으로 줄인 영역 중 p에서 가장 가까운 점. 이미 안에 있으면 p 그대로. */
export function clampToMonitors(p: Vec2, ms: MonitorInfo[], margin: number): Vec2 {
  let best = p, bestD = Infinity;
  for (const m of ms) {
    const r = inset(m.rect, margin);
    const q = { x: Math.min(Math.max(p.x, r.x), r.x + r.w), y: Math.min(Math.max(p.y, r.y), r.y + r.h) };
    const d = dist(p, q);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

/** CSS px로 정한 몸 길이를 해당 모니터의 월드 단위로 */
export function bodyLenWorld(bodyLengthCss: number, m: MonitorInfo | null): number {
  return bodyLengthCss / (m?.cssPerWorld ?? 1);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/world.test.ts && pnpm typecheck`
Expected: 7 tests PASS, 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add src/world.ts src/world.test.ts
git commit -m "feat: add world coordinate and monitor utilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 모니터별 투명 오버레이 + 커서 방송 (Rust + bridge)

**Files:**
- Create: `src-tauri/src/geometry.rs`, `src-tauri/src/platform/mod.rs`, `src-tauri/src/platform/macos.rs`, `src-tauri/src/platform/fallback.rs`, `src-tauri/src/overlay.rs`, `src-tauri/src/poller.rs`, `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs` (전체 교체)
- Create: `src/bridge.ts`
- Modify: `src/main.ts` (임시 디버그 화면 — Task 7에서 교체)

**Interfaces:**
- Consumes: `MonitorInfo`, `Vec2`, `worldToLocal` (Task 2)
- Produces:
  - Rust 이벤트 `cursor` (payload `{x,y} | null`, 월드 좌표, 변할 때만)
  - Rust 명령 `get_monitors() -> MonitorInfo[]` (camelCase 직렬화: `cssPerWorld`)
  - 오버레이 창 라벨 `overlay-<세대>-<번호>`, 초기화 스크립트로 `window.__BER_MONITOR__ = "<모니터 id>"` 주입
  - `bridge.ts`: `monitorId: string | undefined`, `getMonitors(): Promise<MonitorInfo[]>`, `windowOriginWorld(): Promise<Vec2>`, `onCursor(cb)`, `onCatState(cb)`, `sendCatState(s)`, `onCommand(cb)`, `setClickThrough(on)`

- [ ] **Step 1: Rust 공용 타입과 macOS 조회 구현**

`src-tauri/src/geometry.rs`:
```rust
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub rect: Rect,
    pub css_per_world: f64,
    pub primary: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_info_serializes_camel_case() {
        let m = MonitorInfo { id: "1".into(), rect: Rect { x: -1.0, y: 0.0, w: 2.0, h: 3.0 }, css_per_world: 1.0, primary: true };
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, r#"{"id":"1","rect":{"x":-1.0,"y":0.0,"w":2.0,"h":3.0},"cssPerWorld":1.0,"primary":true}"#);
    }
}
```

`src-tauri/src/platform/mod.rs`:
```rust
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
mod fallback;
#[cfg(not(target_os = "macos"))]
pub use fallback::*;
```

`src-tauri/src/platform/macos.rs`:
```rust
// macOS: CoreGraphics 전역 좌표(포인트, 좌상단 원점) = CGWindowList와 같은 좌표계
use crate::geometry::{MonitorInfo, Point, Rect};
use core_graphics::display::CGDisplay;
use core_graphics::event::CGEvent;
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use tauri::AppHandle;

pub fn monitors(_app: &AppHandle) -> Vec<MonitorInfo> {
    let main = CGDisplay::main().id;
    CGDisplay::active_displays()
        .unwrap_or_default()
        .into_iter()
        .map(|id| {
            let b = CGDisplay::new(id).bounds();
            MonitorInfo {
                id: id.to_string(),
                rect: Rect { x: b.origin.x, y: b.origin.y, w: b.size.width, h: b.size.height },
                css_per_world: 1.0,
                primary: id == main,
            }
        })
        .collect()
}

pub fn cursor(_app: &AppHandle) -> Option<Point> {
    let src = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let p = CGEvent::new(src).ok()?.location();
    Some(Point { x: p.x, y: p.y })
}
```

`src-tauri/src/platform/fallback.rs` (계획 C에서 Windows 전용 구현으로 교체):
```rust
// 비-macOS 임시 구현: Tauri가 보고하는 물리 픽셀 좌표를 월드 좌표로 쓴다.
use crate::geometry::{MonitorInfo, Point, Rect};
use tauri::AppHandle;

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

pub fn cursor(app: &AppHandle) -> Option<Point> {
    app.cursor_position().ok().map(|p| Point { x: p.x, y: p.y })
}
```

- [ ] **Step 2: 오버레이 창·폴러·트레이·앱 셋업 구현**

`src-tauri/src/overlay.rs`:
```rust
use crate::{geometry::MonitorInfo, platform};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static GENERATION: AtomicU32 = AtomicU32::new(0);

/// 기존 오버레이를 모두 닫고 현재 모니터마다 하나씩 다시 만든다.
pub fn rebuild(app: &AppHandle) -> tauri::Result<()> {
    for (label, w) in app.webview_windows() {
        if label.starts_with("overlay-") {
            w.destroy()?;
        }
    }
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst);
    for (i, m) in platform::monitors(app).iter().enumerate() {
        create(app, &format!("overlay-{gen}-{i}"), m)?;
    }
    Ok(())
}

fn create(app: &AppHandle, label: &str, m: &MonitorInfo) -> tauri::Result<()> {
    let script = format!("window.__BER_MONITOR__ = {};", serde_json::to_string(&m.id).unwrap_or_default());
    let w = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("베르")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .visible(false)
        .initialization_script(&script)
        .build()?;
    #[cfg(target_os = "macos")]
    {
        w.set_position(tauri::LogicalPosition::new(m.rect.x, m.rect.y))?;
        w.set_size(tauri::LogicalSize::new(m.rect.w, m.rect.h))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        w.set_position(tauri::PhysicalPosition::new(m.rect.x as i32, m.rect.y as i32))?;
        w.set_size(tauri::PhysicalSize::new(m.rect.w as u32, m.rect.h as u32))?;
    }
    w.set_ignore_cursor_events(true)?;
    w.show()?;
    Ok(())
}
```

`src-tauri/src/poller.rs`:
```rust
use crate::{overlay, platform};
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter};

/// 커서는 ~60Hz(바뀔 때만), 모니터 구성은 ~1Hz로 확인한다.
pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut last_cursor = None;
        let mut last_monitors = platform::monitors(&app);
        let mut tick: u64 = 0;
        loop {
            thread::sleep(Duration::from_millis(16));
            tick = tick.wrapping_add(1);
            let c = platform::cursor(&app);
            if c != last_cursor {
                last_cursor = c;
                let _ = app.emit("cursor", c);
            }
            if tick % 60 == 0 {
                let m = platform::monitors(&app);
                if m != last_monitors {
                    last_monitors = m;
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        let _ = overlay::rebuild(&handle);
                    });
                }
            }
        }
    });
}
```

`src-tauri/src/tray.rs` (계획 A: 종료만):
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    let mut tray = TrayIconBuilder::with_id("ber").tooltip("베르").menu(&menu).on_menu_event(|app, e| {
        if e.id().as_ref() == "quit" {
            app.exit(0);
        }
    });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
```

`src-tauri/src/lib.rs` (전체 교체):
```rust
mod geometry;
mod overlay;
mod platform;
mod poller;
mod tray;

use tauri::{AppHandle, RunEvent};

#[tauri::command]
fn get_monitors(app: AppHandle) -> Vec<geometry::MonitorInfo> {
    platform::monitors(&app)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_monitors])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            tray::build(app.handle())?;
            overlay::rebuild(app.handle())?;
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

- [ ] **Step 3: Rust 테스트·빌드 확인**

Run: `(cd src-tauri && cargo test)`
Expected: `monitor_info_serializes_camel_case ... ok`, 빌드 경고 외 오류 없음. API 이름이 다르다는 컴파일 오류가 나면 docs.rs의 해당 크레이트 버전 문서로 정확한 이름을 확인해 고친다(예: `core_graphics::event::CGEvent::new`).

- [ ] **Step 4: bridge와 임시 디버그 화면 작성**

`src/bridge.ts`:
```ts
// Tauri 의존은 이 파일에만 둔다.
import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MonitorInfo, Vec2 } from './world';

declare global { interface Window { __BER_MONITOR__?: string } }

export const bridge = {
  monitorId: window.__BER_MONITOR__,
  getMonitors: () => invoke<MonitorInfo[]>('get_monitors'),
  /** 이 웹뷰 창의 실제 좌상단(월드 좌표). OS가 창 위치를 조정했을 수 있어 직접 확인한다. */
  async windowOriginWorld(): Promise<Vec2> {
    const w = getCurrentWindow();
    const p = await w.outerPosition();
    const k = navigator.userAgent.includes('Mac') ? await w.scaleFactor() : 1;
    return { x: p.x / k, y: p.y / k };
  },
  onCursor: (cb: (p: Vec2 | null) => void): Promise<UnlistenFn> => listen<Vec2 | null>('cursor', (e) => cb(e.payload)),
  onCatState: <T>(cb: (s: T) => void): Promise<UnlistenFn> => listen<T>('cat-state', (e) => cb(e.payload)),
  sendCatState: <T>(s: T): Promise<void> => emit('cat-state', s),
  onCommand: <T>(cb: (c: T) => void): Promise<UnlistenFn> => listen<T>('command', (e) => cb(e.payload)),
  setClickThrough: (on: boolean): Promise<void> => getCurrentWindow().setIgnoreCursorEvents(on),
};
```

`src/main.ts` (임시 디버그 — 모니터 테두리와 커서 점을 그린다. Task 7에서 교체):
```ts
import { bridge } from './bridge';
import { worldToLocal, type MonitorInfo, type Vec2 } from './world';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const monitors = await bridge.getMonitors();
const base = monitors.find((m) => m.id === bridge.monitorId) ?? monitors[0];
const origin = await bridge.windowOriginWorld();
const me: MonitorInfo = { ...base, rect: { ...base.rect, x: origin.x, y: origin.y } };
let cursor: Vec2 | null = null;
await bridge.onCursor((p) => { cursor = p; });

function draw() {
  canvas.width = innerWidth; canvas.height = innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,0,128,.8)'; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = 'rgba(255,0,128,.9)'; ctx.font = '20px sans-serif';
  ctx.fillText(`monitor ${me.id} ${me.primary ? '(primary)' : ''} origin ${origin.x},${origin.y}`, 20, 40);
  if (cursor) {
    const l = worldToLocal(cursor, me);
    ctx.beginPath(); ctx.arc(l.x, l.y, 14, 0, Math.PI * 2); ctx.stroke();
  }
  requestAnimationFrame(draw);
}
draw();
```

- [ ] **Step 5: 실행해서 눈으로 확인**

Run (백그라운드): `pnpm tauri dev`
그다음: 커서를 각 모니터로 옮기며 `screencapture -x /tmp/ber-overlay.png`로 캡처해 확인.
Expected:
- 모든 모니터 가장자리에 분홍 테두리, 좌상단에 모니터 id와 `origin`이 보인다. 주 모니터에 `(primary)`.
- 분홍 원이 커서를 정확히 따라간다(어긋나면 좌표계 문제 — `origin`과 `CGDisplay` bounds 비교).
- 오버레이 위에서도 아래 앱 클릭·스크롤이 그대로 된다.
- Dock에 아이콘이 없고, 메뉴바 트레이 아이콘의 "종료"로 앱이 끝난다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: add click-through overlay per monitor with cursor broadcast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 베르 모델과 렌더러 (정지 자세)

**Files:**
- Create: `src/cat/graph.ts`, `src/cat/graph.test.ts`, `src/cat/params.ts`, `src/cat/model.ts`, `src/render.ts`, `src/gallery.ts`
- Modify: `src/main.ts` (`?gallery` 분기 추가)

**Interfaces:**
- Consumes: `Vec2`, `Rect` (Task 2)
- Produces:
  - `graph.ts`: `type PoseName = 'stand'|'sit'|'loaf'|'groom'|'lieSide'|'curl'|'bellyUp'|'crouch'`, `POSE_NAMES: PoseName[]`, `TRANSITION_SEC = 0.6`, `posePath(from, to): PoseName[]`, `transitionTime(from, to): number`
  - `params.ts`: `interface CatParams`, `BER: CatParams`, `MODEL_BODY_LENGTH = 1.2`
  - `model.ts`: `SPINE_BONES = 5`, `interface Leg {hip; knee; front; side}`, `interface CatRig {params; root; body; bones; neck; head; ears; eyes; legs; tailBase; setEyes(closed); setTail(points); dispose()}`, `buildCat(p: CatParams): CatRig`
  - `render.ts`: `TILT`, `class CatView { constructor(canvas, params); rig; resize(wCss, hCss); place(posCss: Vec2, heading: number, bodyLengthCss: number); boundsCss(): Rect; onCanvas(): boolean; render(): void; clear(): void }`

- [ ] **Step 1: 자세 그래프 실패 테스트 작성**

`src/cat/graph.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { posePath, transitionTime, TRANSITION_SEC, POSE_NAMES } from './graph';

describe('pose graph', () => {
  it('returns a single node when already there', () => {
    expect(posePath('loaf', 'loaf')).toEqual(['loaf']);
    expect(transitionTime('loaf', 'loaf')).toBe(0);
  });
  it('routes stand to bellyUp through loaf and lieSide', () => {
    expect(posePath('stand', 'bellyUp')).toEqual(['stand', 'loaf', 'lieSide', 'bellyUp']);
  });
  it('routes groom to curl through the shortest path', () => {
    expect(posePath('groom', 'curl')).toEqual(['groom', 'sit', 'stand', 'loaf', 'lieSide', 'curl']);
  });
  it('connects every pose to every other pose', () => {
    for (const a of POSE_NAMES) for (const b of POSE_NAMES) {
      const p = posePath(a, b);
      expect(p[0]).toBe(a);
      expect(p[p.length - 1]).toBe(b);
    }
  });
  it('charges TRANSITION_SEC per edge', () => {
    expect(transitionTime('stand', 'curl')).toBeCloseTo(3 * TRANSITION_SEC);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/cat/graph.test.ts`
Expected: FAIL — `Failed to resolve import "./graph"`

- [ ] **Step 3: 그래프 구현**

`src/cat/graph.ts`:
```ts
// 자세 이름과 허용된 전환. 두뇌(전환 시간 예측)와 애니메이터(실제 보간)가 같이 쓴다.
export type PoseName = 'stand' | 'sit' | 'loaf' | 'groom' | 'lieSide' | 'curl' | 'bellyUp' | 'crouch';
export const POSE_NAMES: PoseName[] = ['stand', 'sit', 'loaf', 'groom', 'lieSide', 'curl', 'bellyUp', 'crouch'];

const EDGES: [PoseName, PoseName][] = [
  ['stand', 'sit'], ['sit', 'groom'],
  ['stand', 'loaf'], ['loaf', 'lieSide'], ['lieSide', 'bellyUp'], ['lieSide', 'curl'],
  ['stand', 'crouch'],
];

export const TRANSITION_SEC = 0.6;

const ADJ = new Map<PoseName, PoseName[]>();
for (const [a, b] of EDGES) {
  ADJ.set(a, [...(ADJ.get(a) ?? []), b]);
  ADJ.set(b, [...(ADJ.get(b) ?? []), a]);
}

/** from에서 to까지 거쳐 가는 자세 목록(양 끝 포함, BFS 최단 경로) */
export function posePath(from: PoseName, to: PoseName): PoseName[] {
  if (from === to) return [from];
  const prev = new Map<PoseName, PoseName>([[from, from]]);
  const queue: PoseName[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const n of ADJ.get(cur) ?? []) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  const path: PoseName[] = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

export const transitionTime = (from: PoseName, to: PoseName): number => (posePath(from, to).length - 1) * TRANSITION_SEC;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/cat/graph.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: 외형 파라미터·모델·렌더러·갤러리 작성**

`src/cat/params.ts`:
```ts
// 확정 외형 (spec §5.1). 단위는 모델 단위, 렌더 시 몸 길이에 맞춰 스케일한다.
export interface CatParams {
  a: number; b: number; c: number; rump: number;
  legLen: number; legR: number;
  tailLen: number; tailR: number; tailLift: number;
  headR: number; headScale: [number, number, number]; hx: number; hy: number;
  cheek: number; pad: number;
  ear: { h: number; r: number; tilt: number };
  eye: { r: number; spread: number; height: number };
  whisker: number;
  colors: { fur: number; white: number; nose: number; pupil: number; iris: number };
  toonLevels: number[];
  rim: { strength: number; color: [number, number, number]; power: number };
}

export const BER: CatParams = {
  a: 0.46, b: 0.21, c: 0.25, rump: 1.12,
  legLen: 0.2, legR: 0.05,
  tailLen: 0.72, tailR: 0.042, tailLift: 0.22,
  headR: 0.2, headScale: [1, 0.9, 1.08], hx: 0.86, hy: 0.6,
  cheek: 0.55, pad: 1,
  ear: { h: 0.2, r: 0.095, tilt: 0.45 },
  eye: { r: 0.16, spread: 0.4, height: 0.1 },
  whisker: 2.0,
  colors: { fur: 0x23252b, white: 0xf4f3ee, nose: 0x1a1a1d, pupil: 0x0c0c0e, iris: 0xc5d63d },
  toonLevels: [60, 105, 150, 200, 255],
  rim: { strength: 0.35, color: [0.62, 0.71, 0.85], power: 3 },
};

/** 코끝~엉덩이 길이(모델 단위). 화면 몸 길이(CSS px) 환산 기준 */
export const MODEL_BODY_LENGTH = 1.2;
```

`src/cat/model.ts`:
```ts
// 베르를 코드로 만든다: 스키닝된 몸통(척추 뼈 5개) + 강체 부위(머리·다리·꼬리)를 뼈에 붙인다.
// 모델 좌표: +X 앞, +Y 위, Z 좌우. 바닥 y=0.
import * as THREE from 'three';
import type { CatParams } from './params';

export const SPINE_BONES = 5;

export interface Leg { hip: THREE.Group; knee: THREE.Group; front: boolean; side: 1 | -1 }

export interface CatRig {
  params: CatParams;
  root: THREE.Group;   // 바닥 위치·방향·크기
  body: THREE.Group;   // 높이·롤·피치
  bones: THREE.Bone[]; // 0 엉덩이 … 4 가슴
  neck: THREE.Group;
  head: THREE.Group;
  ears: THREE.Group[];
  eyes: THREE.Group[];
  legs: Leg[];         // 0 앞왼, 1 앞오, 2 뒤왼, 3 뒤오
  tailBase: THREE.Group;
  setEyes(closed: number): void;          // 0 뜸 ~ 1 감음
  setTail(points: THREE.Vector3[]): void; // tailBase 로컬 좌표
  dispose(): void;
}

const SPHERE = new THREE.SphereGeometry(1, 32, 20);
type V3 = [number, number, number];

function gradientMap(levels: number[]): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** 테두리 광: 면이 시선과 수직일수록 밝힌다. 직교 카메라라 시선 = view-space +Z */
function withRim<T extends THREE.Material>(mat: T, p: CatParams): T {
  const [r, g, b] = p.rim.color.map((v) => v.toFixed(3));
  const strength = p.rim.strength.toFixed(3), power = p.rim.power.toFixed(2);
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      `float berRim = 1.0 - clamp(normalize(normal).z, 0.0, 1.0);
       gl_FragColor.rgb += vec3(${r}, ${g}, ${b}) * pow(berRim, ${power}) * ${strength};
       #include <tonemapping_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => `ber-rim-${r}-${g}-${b}-${strength}-${power}`;
  return mat;
}

/** 척추를 따라 단면 링을 이은 몸통. 각 정점은 x 위치에 따라 인접한 두 뼈에 선형 가중치로 묶인다. */
function torsoGeometry(p: CatParams, A: number, ox: number, cy: number, boneX: number[]): THREE.BufferGeometry {
  const N = 32, M = 28;
  const pos: number[] = [], skinIndex: number[] = [], skinWeight: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, sp = Math.sqrt(Math.max(Math.sin(Math.PI * t), 0));
    const w = p.c * sp * (p.rump + (0.9 - p.rump) * t);
    const h = p.b * sp * (1 - 0.06 * t);
    const yc = cy - p.b * 0.05 * Math.sin(Math.PI * t);
    const x = ox - A + 2 * A * t;
    let k = 0;
    while (k < boneX.length - 2 && x > boneX[k + 1]) k++;
    const f = Math.min(1, Math.max(0, (x - boneX[k]) / (boneX[k + 1] - boneX[k])));
    for (let j = 0; j <= M; j++) {
      const ph = (j / M) * Math.PI * 2;
      pos.push(x, yc + Math.sin(ph) * h, Math.cos(ph) * w);
      skinIndex.push(k, k + 1, 0, 0);
      skinWeight.push(1 - f, f, 0, 0);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const k = i * (M + 1) + j, k2 = k + M + 1;
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCat(p: CatParams): CatRig {
  const C = p.colors;
  const grad = gradientMap(p.toonLevels);
  const fur = withRim(new THREE.MeshToonMaterial({ color: C.fur, gradientMap: grad }), p);
  const white = new THREE.MeshToonMaterial({ color: C.white, gradientMap: grad });
  const nose = new THREE.MeshToonMaterial({ color: C.nose, gradientMap: grad });
  const iris = new THREE.MeshBasicMaterial({ color: C.iris });
  const pupil = new THREE.MeshBasicMaterial({ color: C.pupil });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const disposables: { dispose(): void }[] = [grad, fur, white, nose, iris, pupil, shine];

  const E = (parent: THREE.Object3D, mat: THREE.Material, pos: V3, semi: V3) => {
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.set(...pos); m.scale.set(...semi); parent.add(m);
    return m;
  };
  const capsule = (parent: THREE.Object3D, mat: THREE.Material, r: number, len: number, y: number) => {
    const geo = new THREE.CapsuleGeometry(r, Math.max(len, 0.001), 6, 12);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y; parent.add(m);
    return m;
  };

  const { a, b, c, headR: hr } = p;
  const [sx, sy, sz] = p.headScale;
  const cy = p.legLen + b * 0.55;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 척추 뼈: 몸통 길이를 따라 균등 배치 (휴식 자세는 회전 없음)
  const A = a * 1.05, ox = -a * 0.05;
  const boneX = Array.from({ length: SPINE_BONES }, (_, i) => ox - A + (2 * A * i) / (SPINE_BONES - 1));
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < SPINE_BONES; i++) {
    const bone = new THREE.Bone();
    if (i === 0) { bone.position.set(boneX[0], cy, 0); body.add(bone); }
    else { bone.position.set(boneX[i] - boneX[i - 1], 0, 0); bones[i - 1].add(bone); }
    bones.push(bone);
  }
  const torsoGeo = torsoGeometry(p, A, ox, cy, boneX);
  disposables.push(torsoGeo);
  const torso = new THREE.SkinnedMesh(torsoGeo, fur);
  torso.frustumCulled = false;
  body.add(torso);
  root.updateMatrixWorld(true);
  torso.bind(new THREE.Skeleton(bones));

  /** 몸통 좌표(x, y, z)를 i번 뼈의 로컬 좌표로 */
  const at = (i: number, x: number, y: number, z = 0): V3 => [x - boneX[i], y - cy, z];

  // 흰 턱받이
  E(bones[4], white, at(4, a * 0.84, cy - b * 0.12), [a * 0.2, b * 0.5, c * 0.42]);

  // 목 → 머리
  const neckPos: V3 = [a * 0.72, cy + b * 0.3, 0];
  const neck = new THREE.Group();
  neck.position.set(...at(4, neckPos[0], neckPos[1]));
  bones[4].add(neck);
  const head = new THREE.Group();
  head.position.set(a * p.hx + hr * 0.3 - neckPos[0], cy + b * p.hy - neckPos[1], 0);
  neck.add(head);
  E(head, fur, [0, 0, 0], [hr * sx, hr * sy, hr * sz]);
  for (const z of [-1, 1]) E(head, fur, [hr * 0.12, -hr * 0.3, z * hr * 0.6 * sz], [hr * 0.5 * p.cheek, hr * 0.42 * p.cheek, hr * 0.48 * p.cheek]);
  E(head, fur, [hr * 0.72 * sx, -hr * 0.3, 0], [hr * 0.24, hr * 0.2, hr * 0.36]);   // 주둥이
  E(head, white, [hr * 0.8 * sx, -hr * 0.43, 0], [hr * 0.2, hr * 0.13, hr * 0.27]); // 흰 턱
  for (const z of [-1, 1]) E(head, white, [hr * 0.86 * sx, -hr * 0.31, z * hr * 0.13 * p.pad], [hr * 0.13 * p.pad, hr * 0.11 * p.pad, hr * 0.14 * p.pad]); // 흰 콧수염 패드
  E(head, nose, [hr * 0.98 * sx, -hr * 0.2, 0], [hr * 0.06, hr * 0.045, hr * 0.075]);

  // 눈: 머리 타원체 표면에 붙이고 표면 법선을 바라보게
  const eyes: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const d = new THREE.Vector3(0.9, p.eye.height, p.eye.spread * z).normalize();
    const pos = new THREE.Vector3(d.x * hr * sx, d.y * hr * sy, d.z * hr * sz).multiplyScalar(0.97);
    const n = new THREE.Vector3(pos.x / (sx * sx), pos.y / (sy * sy), pos.z / (sz * sz)).normalize();
    const eg = new THREE.Group();
    eg.position.copy(pos);
    eg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    head.add(eg);
    const er = hr * p.eye.r;
    E(eg, iris, [0, 0, 0], [er, er * 1.05, er * 0.4]);
    E(eg, pupil, [0, 0, er * 0.2], [er * 0.45, er * 0.82, er * 0.3]);
    E(eg, shine, [er * 0.32 * (z > 0 ? -1 : 1), er * 0.4, er * 0.42], [er * 0.22, er * 0.22, er * 0.14]);
    eyes.push(eg);
  }

  // 귀
  const ears: THREE.Group[] = [];
  const earGeo = new THREE.ConeGeometry(p.ear.r, p.ear.h, 24);
  disposables.push(earGeo);
  for (const z of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(-hr * 0.08, hr * 0.5 * sy, z * hr * 0.62 * sz);
    eg.rotation.set(z * p.ear.tilt, 0, 0.2);
    head.add(eg);
    const m = new THREE.Mesh(earGeo, fur);
    m.position.y = p.ear.h * 0.3; m.scale.set(0.45, 1, 1);
    eg.add(m);
    ears.push(eg);
  }

  // 수염
  const wpts: THREE.Vector3[] = [], W = hr * p.whisker;
  for (const z of [-1, 1]) for (let k = 0; k < 3; k++) {
    const s0 = new THREE.Vector3(hr * 0.88 * sx, -hr * 0.3, z * hr * 0.2 * p.pad);
    wpts.push(s0, new THREE.Vector3(s0.x + (k - 1) * hr * 0.2 + hr * 0.08, s0.y + (k - 1) * hr * 0.1 - hr * 0.04, z * (hr * 0.2 * p.pad + W)));
  }
  const wGeo = new THREE.BufferGeometry().setFromPoints(wpts);
  const wMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  disposables.push(wGeo, wMat);
  head.add(new THREE.LineSegments(wGeo, wMat));

  // 다리: 엉덩이/어깨 → 윗다리 → 무릎 → 아랫다리 + 발. 앞발은 발끝만 흰색, 뒷발은 흰 양말.
  const hipY = cy - b * 0.35, L = hipY, L1 = L * 0.5, L2 = L - L1, r = p.legR;
  const legs: Leg[] = [];
  const defs: [number, 1 | -1, boolean, number][] = [[a * 0.6, 1, true, 3], [a * 0.6, -1, true, 3], [-a * 0.6, 1, false, 1], [-a * 0.6, -1, false, 1]];
  for (const [x, side, front, bi] of defs) {
    const hip = new THREE.Group();
    hip.position.set(...at(bi, x, hipY, side * c * 0.55));
    bones[bi].add(hip);
    capsule(hip, fur, r, L1, -L1 / 2);
    const knee = new THREE.Group();
    knee.position.y = -L1;
    hip.add(knee);
    capsule(knee, fur, r * 0.95, L2 - r, -(L2 - r) / 2);
    E(knee, fur, [r * 0.3, -L2 + r * 0.9, 0], [r * 1.3, r * 0.8, r * 1.1]);
    if (front) {
      E(knee, white, [r * 1.0, -L2 + r * 0.75, 0], [r * 0.75, r * 0.6, r * 0.95]);
    } else {
      const sock = L * 0.42;
      capsule(knee, white, r, Math.max(sock - 2 * r, 0.001), -L2 + sock / 2);
      E(knee, white, [r * 0.3, -L2 + r * 0.9, 0], [r * 1.35, r * 0.85, r * 1.15]);
    }
    legs.push({ hip, knee, front, side });
  }

  // 꼬리: 엉덩이 뼈에 붙은 튜브. 점은 애니메이터가 매 프레임 계산한다.
  const tailBase = new THREE.Group();
  tailBase.position.set(...at(0, -a * 0.95, cy + b * 0.2));
  bones[0].add(tailBase);
  const tip = E(tailBase, fur, [0, 0, 0], [p.tailR, p.tailR, p.tailR]);
  let tailMesh: THREE.Mesh | null = null;
  const setTail = (pts: THREE.Vector3[]) => {
    if (tailMesh) { tailBase.remove(tailMesh); tailMesh.geometry.dispose(); }
    tailMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, p.tailR, 10), fur);
    tailBase.add(tailMesh);
    tip.position.copy(pts[pts.length - 1]);
  };
  setTail([0, 1, 2, 3].map((i) => new THREE.Vector3(-i * p.tailLen / 3, Math.sin(i / 3 * 2.6) * p.tailLen * p.tailLift, 0)));

  // 눈꺼풀: 눈을 세로로 납작하게 하며 홍채색을 털색 쪽으로 (검은 고양이는 감은 눈이 거의 안 보임)
  const irisOpen = new THREE.Color(C.iris), irisShut = new THREE.Color(C.fur).multiplyScalar(1.6);
  const setEyes = (closed: number) => {
    const k = Math.min(1, Math.max(0, closed));
    for (const eg of eyes) eg.scale.y = 1 - 0.9 * k;
    iris.color.copy(irisOpen).lerp(irisShut, k * k);
  };

  return {
    params: p, root, body, bones, neck, head, ears, eyes, legs, tailBase, setEyes, setTail,
    dispose: () => { disposables.forEach((d) => d.dispose()); tailMesh?.geometry.dispose(); },
  };
}
```

`src/render.ts`:
```ts
// 한 모니터(캔버스)에 베르 한 마리를 그린다. 씬 단위 = 이 캔버스의 CSS px.
import * as THREE from 'three';
import { buildCat, type CatRig } from './cat/model';
import { MODEL_BODY_LENGTH, type CatParams } from './cat/params';
import type { Rect, Vec2 } from './world';

export const TILT = (38 * Math.PI) / 180;
const COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);
const CAM_DIST = 5000;

function shadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.38)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

export class CatView {
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: CatRig;
  private scene = new THREE.Scene();
  private shadowScene = new THREE.Scene();
  private shadowGroup = new THREE.Group();
  private camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, CAM_DIST * 2);
  private w = 1;
  private h = 1;
  private posCss: Vec2 = { x: 0, y: 0 };
  private lenCss = 130;
  private drewLast = false;

  constructor(canvas: HTMLCanvasElement, params: CatParams) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(-2, 6, -2.5);
    this.scene.add(dl);

    this.rig = buildCat(params);
    this.scene.add(this.rig.root);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.shadowGroup.add(shadow);
    this.shadowScene.add(this.shadowGroup);

    // 수직에서 TILT만큼 기울여 +Z 쪽에서 내려다본다. 바닥점 (x, 0, y/cosT)가 화면 (x, y)에 온다.
    this.camera.up.set(0, SIN_T, -COS_T);
    this.camera.position.set(0, CAM_DIST * COS_T, CAM_DIST * SIN_T);
    this.camera.lookAt(0, 0, 0);
  }

  resize(wCss: number, hCss: number) {
    this.w = wCss; this.h = hCss;
    this.renderer.setSize(wCss, hCss, false);
    Object.assign(this.camera, { left: 0, right: wCss, top: 0, bottom: -hCss });
    this.camera.updateProjectionMatrix();
  }

  /** posCss: 캔버스 CSS 좌표, heading: 화면 기준 진행 방향(라디안, y 아래로) */
  place(posCss: Vec2, heading: number, bodyLengthCss: number) {
    this.posCss = posCss;
    this.lenCss = bodyLengthCss;
    const yaw = Math.atan2(Math.sin(heading) / COS_T, Math.cos(heading));
    const root = this.rig.root;
    root.position.set(posCss.x, 0, posCss.y / COS_T);
    root.rotation.y = -yaw;
    root.scale.setScalar(bodyLengthCss / MODEL_BODY_LENGTH);
    this.shadowGroup.position.set(posCss.x + 0.04 * bodyLengthCss, 0, posCss.y / COS_T + 0.05 * bodyLengthCss);
    this.shadowGroup.rotation.y = -yaw;
    this.shadowGroup.scale.set(bodyLengthCss * 1.15, 1, bodyLengthCss * 0.6);
  }

  /** 베르가 차지할 수 있는 화면 영역(꼬리·수염·그림자 포함 여유) */
  boundsCss(): Rect {
    const r = this.lenCss * 1.3;
    const cx = this.posCss.x, cy = this.posCss.y - this.lenCss * 0.25 * SIN_T;
    return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
  }

  onCanvas(): boolean {
    const b = this.boundsCss();
    return b.x < this.w && b.y < this.h && b.x + b.w > 0 && b.y + b.h > 0;
  }

  /** 베르 주변만 scissor로 그린다. 나머지는 브라우저가 프레임마다 투명으로 지운다(preserveDrawingBuffer=false). */
  render() {
    if (!this.onCanvas()) { this.clear(); return; }
    const R = this.renderer, b = this.boundsCss();
    const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
    const w = Math.min(this.w, Math.ceil(b.x + b.w)) - x, h = Math.min(this.h, Math.ceil(b.y + b.h)) - y;
    R.setScissorTest(true);
    R.setScissor(x, this.h - (y + h), w, h);
    R.clear();
    R.render(this.shadowScene, this.camera);
    R.clearDepth();
    R.render(this.scene, this.camera);
    this.drewLast = true;
  }

  /** 마지막으로 그린 베르를 지운다(이미 지웠으면 아무것도 안 함) */
  clear() {
    if (!this.drewLast) return;
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.drewLast = false;
  }
}
```

`src/gallery.ts` (Task 4 버전 — 정지 자세 1마리. Task 5에서 확장):
```ts
// 개발용: 일반 브라우저에서 http://localhost:1420/?gallery 로 연다. Tauri 없이 동작.
import { CatView } from './render';
import { BER } from './cat/params';

export function runGallery() {
  document.body.style.background = 'linear-gradient(135deg,#eef2f7,#cdd8e6)';
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const view = new CatView(canvas, BER);
  const loop = () => {
    view.resize(innerWidth, innerHeight);
    view.place({ x: innerWidth / 2, y: innerHeight / 2 }, Math.PI / 2 - 0.3, 260);
    view.render();
    requestAnimationFrame(loop);
  };
  loop();
}
```

`src/main.ts` 맨 위에 갤러리 분기 추가(디버그 코드는 Task 7에서 교체):
```ts
import { runGallery } from './gallery';
if (new URLSearchParams(location.search).has('gallery')) {
  runGallery();
} else {
  await import('./debug-overlay');
}
```
그리고 기존 디버그 코드를 `src/debug-overlay.ts`로 옮긴다(내용 동일, 첫 줄 import 경로 `./bridge`, `./world` 유지).

- [ ] **Step 6: 갤러리로 외형 확인**

Run (백그라운드): `pnpm dev` → Playwright로 `http://localhost:1420/?gallery` 열고 스크린샷.
Expected: 시안 `docs/mockups/style-final.html`의 2번(기본 귀 · 5단계 명암)과 같은 모습의 베르가 화면 중앙에서 비스듬히 화면 쪽을 보고 서 있다. 흰 턱·턱받이·앞발 끝·뒷발 양말, 연두 눈과 하이라이트, 수염, 그림자가 보인다. 콘솔 오류 없음. 다르면 `model.ts`의 위치 계산을 시안 코드와 대조해 고친다.

- [ ] **Step 7: 전체 테스트·타입체크 후 커밋**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 PASS

```bash
git add -A
git commit -m "feat: build Ber procedural rig and tilted ortho renderer with dev gallery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 자세·전환·보행 애니메이션

**Files:**
- Create: `src/cat/poses.ts`, `src/cat/poses.test.ts`, `src/cat/animator.ts`
- Modify: `src/gallery.ts` (전체 교체: 모든 자세 + 전환 순환 + 걷기/뛰기)

**Interfaces:**
- Consumes: `PoseName`, `posePath`, `TRANSITION_SEC`, `POSE_NAMES` (Task 4), `CatRig`, `SPINE_BONES` (Task 4), `CatParams`, `BER`
- Produces:
  - `poses.ts`: `interface LegPose {swing; knee; splay}`, `interface Pose {height; roll; pitch; spineYaw; spinePitch; neckPitch; neckYaw; legs: [LegPose×4]; tail: {lift; curl; sway}; eyes}`, `POSES: Record<PoseName, Pose>`, `lerpPose(a, b, k): Pose`
  - `animator.ts`: `type Gait = 'none'|'walk'|'run'`, `interface Overlays {purr; tailThump; earTwitch}`, `NO_OVERLAYS`, `interface AnimInput {gait; speed /*몸길이/초*/; heading; overlays; lookYaw: number|null}`, `class Animator { constructor(rig, start?: PoseName); readonly transitioning: boolean; readonly pose: PoseName; setTarget(name); update(dt, input) }`

- [ ] **Step 1: 자세 보간 실패 테스트 작성**

`src/cat/poses.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { POSES, lerpPose } from './poses';
import { POSE_NAMES } from './graph';

describe('poses', () => {
  it('defines every pose with four legs and finite numbers', () => {
    for (const n of POSE_NAMES) {
      const p = POSES[n];
      expect(p.legs).toHaveLength(4);
      const nums = [p.height, p.roll, p.pitch, p.spineYaw, p.spinePitch, p.neckPitch, p.neckYaw, p.eyes, p.tail.lift, p.tail.curl, p.tail.sway, ...p.legs.flatMap((l) => [l.swing, l.knee, l.splay])];
      for (const v of nums) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('lerps endpoints exactly and midpoints linearly', () => {
    const a = POSES.stand, b = POSES.bellyUp;
    expect(lerpPose(a, b, 0)).toEqual(a);
    expect(lerpPose(a, b, 1)).toEqual(b);
    const m = lerpPose(a, b, 0.5);
    expect(m.roll).toBeCloseTo((a.roll + b.roll) / 2);
    expect(m.legs[3].splay).toBeCloseTo((a.legs[3].splay + b.legs[3].splay) / 2);
  });
  it('closes eyes when sleeping curled', () => {
    expect(POSES.curl.eyes).toBe(1);
    expect(POSES.stand.eyes).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/cat/poses.test.ts`
Expected: FAIL — `Failed to resolve import "./poses"`

- [ ] **Step 3: 자세 데이터 구현**

`src/cat/poses.ts` — 초기값. Step 6에서 갤러리를 보며 숫자를 다듬는다.
```ts
// 자세 = 뼈 각도 묶음. 각도는 라디안, height는 모델 단위.
// 관절 규칙: legs.swing>0 발이 앞으로, knee는 아랫다리 굽힘, splay>0 바깥으로 벌림.
// roll>0 몸이 옆으로 눕는 방향, pitch>0 가슴이 들림, neckPitch<0 고개 숙임.
import type { PoseName } from './graph';
import { BER } from './params';

export interface LegPose { swing: number; knee: number; splay: number }
export interface Pose {
  height: number; roll: number; pitch: number;
  spineYaw: number; spinePitch: number;
  neckPitch: number; neckYaw: number;
  legs: [LegPose, LegPose, LegPose, LegPose]; // 앞왼 앞오 뒤왼 뒤오
  tail: { lift: number; curl: number; sway: number };
  eyes: number; // 0 뜸 ~ 1 감음
}

const leg = (swing = 0, knee = 0, splay = 0): LegPose => ({ swing, knee, splay });
const cy = BER.legLen + BER.b * 0.55;

const stand: Pose = {
  height: 0, roll: 0, pitch: 0, spineYaw: 0, spinePitch: 0, neckPitch: 0, neckYaw: 0,
  legs: [leg(), leg(), leg(), leg()],
  tail: { lift: 0.55, curl: 0.15, sway: 0.25 },
  eyes: 0,
};

export const POSES: Record<PoseName, Pose> = {
  stand,
  sit: {
    ...stand, pitch: 0.55, neckPitch: -0.3,
    legs: [leg(-0.55), leg(-0.55), leg(1.35, -2.5), leg(1.35, -2.5)],
    tail: { lift: -0.35, curl: 0.9, sway: 0.06 },
  },
  groom: {
    ...stand, pitch: 0.55, neckPitch: -0.75, neckYaw: 0.35, eyes: 0.6,
    legs: [leg(0.9, -1.7), leg(-0.55), leg(1.35, -2.5), leg(1.35, -2.5)],
    tail: { lift: -0.35, curl: 0.9, sway: 0.04 },
  },
  loaf: {
    ...stand, height: -BER.legLen * 0.9, neckPitch: -0.12, eyes: 0.5,
    legs: [leg(-1.2, 2.4), leg(-1.2, 2.4), leg(1.2, -2.4), leg(1.2, -2.4)],
    tail: { lift: -0.3, curl: 1.1, sway: 0.03 },
  },
  lieSide: {
    ...stand, height: BER.c - cy, roll: 1.45, neckPitch: 0.1, eyes: 0.8,
    legs: [leg(0.35, 0, 0.25), leg(0.35, 0, 0.1), leg(-0.3, 0, 0.25), leg(-0.3, 0, 0.1)],
    tail: { lift: 0, curl: 0.4, sway: 0.05 },
  },
  curl: {
    ...stand, height: BER.c - cy, roll: 1.45, spineYaw: 1.3, neckYaw: 0.9, neckPitch: -0.2, eyes: 1,
    legs: [leg(0.4, -1.2), leg(0.4, -1.2), leg(0.6, -1.4), leg(0.6, -1.4)],
    tail: { lift: 0, curl: 2.4, sway: 0.02 },
  },
  bellyUp: {
    ...stand, height: BER.b - cy, roll: 2.8, spineYaw: 0.3, neckYaw: 0.5, eyes: 0.3,
    legs: [leg(0.7, -1.4, 0.1), leg(0.7, -1.4, 0.1), leg(-0.2, -0.3, 0.6), leg(-0.2, -0.3, 0.6)],
    tail: { lift: 0, curl: 0.5, sway: 0.1 },
  },
  crouch: {
    ...stand, height: -BER.legLen * 0.5, pitch: -0.08, neckPitch: -0.2,
    legs: [leg(-0.5, 1.0), leg(-0.5, 1.0), leg(0.7, -1.4), leg(0.7, -1.4)],
    tail: { lift: -0.1, curl: 0.1, sway: 0.5 },
  },
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpLeg = (a: LegPose, b: LegPose, k: number): LegPose => ({ swing: lerp(a.swing, b.swing, k), knee: lerp(a.knee, b.knee, k), splay: lerp(a.splay, b.splay, k) });

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  return {
    height: lerp(a.height, b.height, k), roll: lerp(a.roll, b.roll, k), pitch: lerp(a.pitch, b.pitch, k),
    spineYaw: lerp(a.spineYaw, b.spineYaw, k), spinePitch: lerp(a.spinePitch, b.spinePitch, k),
    neckPitch: lerp(a.neckPitch, b.neckPitch, k), neckYaw: lerp(a.neckYaw, b.neckYaw, k),
    legs: [lerpLeg(a.legs[0], b.legs[0], k), lerpLeg(a.legs[1], b.legs[1], k), lerpLeg(a.legs[2], b.legs[2], k), lerpLeg(a.legs[3], b.legs[3], k)],
    tail: { lift: lerp(a.tail.lift, b.tail.lift, k), curl: lerp(a.tail.curl, b.tail.curl, k), sway: lerp(a.tail.sway, b.tail.sway, k) },
    eyes: lerp(a.eyes, b.eyes, k),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/cat/poses.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: 애니메이터와 갤러리 작성**

`src/cat/animator.ts`:
```ts
// 목표 자세로 그래프 경로를 따라 보간하고, 그 위에 보행·숨쉬기·덧씌우는 동작을 얹어 뼈대에 적용한다.
import * as THREE from 'three';
import { SPINE_BONES, type CatRig } from './model';
import type { CatParams } from './params';
import { posePath, TRANSITION_SEC, type PoseName } from './graph';
import { POSES, lerpPose, type Pose } from './poses';

export type Gait = 'none' | 'walk' | 'run';
export interface Overlays { purr: boolean; tailThump: boolean; earTwitch: boolean }
export const NO_OVERLAYS: Overlays = { purr: false, tailThump: false, earTwitch: false };
export interface AnimInput { gait: Gait; speed: number; heading: number; overlays: Overlays; lookYaw: number | null }

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** 꼬리 관절 8마디의 점(tailBase 로컬). 뒤쪽(-X)으로 출발해 lift만큼 들리고 끝으로 갈수록 처진다. */
function tailPoints(p: CatParams, tail: Pose['tail'], time: number): THREE.Vector3[] {
  const n = 8, seg = p.tailLen / n;
  const pts = [new THREE.Vector3()];
  let yaw = Math.PI, pitch = tail.lift;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    yaw += tail.curl / n + (Math.sin(time * 2.1 - u * 2.6) * tail.sway * u * 4) / n;
    pitch -= (tail.lift * 1.4 + 0.15) / n;
    const q = pts[i - 1];
    pts.push(new THREE.Vector3(
      q.x + Math.cos(pitch) * Math.cos(yaw) * seg,
      q.y + Math.sin(pitch) * seg,
      q.z - Math.cos(pitch) * Math.sin(yaw) * seg,
    ));
  }
  return pts;
}

export class Animator {
  private at: PoseName;
  private queue: PoseName[] = [];
  private from: Pose;
  private t = 0;
  private phase = 0;
  private time = 0;
  private lastHeading: number | null = null;
  private turn = 0;

  constructor(private rig: CatRig, start: PoseName = 'loaf') {
    this.at = start;
    this.from = POSES[start];
  }

  get transitioning(): boolean { return this.queue.length > 0; }
  /** 최종 목표 자세 */
  get pose(): PoseName { return this.queue[this.queue.length - 1] ?? this.at; }

  setTarget(name: PoseName) {
    if (name === this.pose) return;
    const head = this.queue[0] ?? this.at;              // 진행 중인 구간은 끝까지 간다
    const rest = posePath(head, name).slice(1);
    this.queue = this.queue.length ? [this.queue[0], ...rest] : rest;
  }

  update(dt: number, inp: AnimInput) {
    this.time += dt;
    if (this.queue.length) {
      this.t += dt / TRANSITION_SEC;
      while (this.t >= 1 && this.queue.length) {
        this.at = this.queue.shift()!;
        this.from = POSES[this.at];
        this.t -= 1;
      }
      if (!this.queue.length) this.t = 0;
    }
    const base = this.queue.length ? lerpPose(this.from, POSES[this.queue[0]], ease(this.t)) : POSES[this.at];

    // 가변 복사본에 절차적 동작을 얹는다
    const legs = base.legs.map((l) => ({ ...l }));
    const tail = { ...base.tail };
    let { height, roll, pitch, spineYaw, spinePitch, neckPitch, neckYaw, eyes } = base;
    let rumpYaw = 0;

    if (this.lastHeading !== null && dt > 0) {
      const rate = angleDelta(this.lastHeading, inp.heading) / dt;
      this.turn += (rate - this.turn) * Math.min(1, dt * 6);
    }
    this.lastHeading = inp.heading;

    const settled = !this.queue.length;
    const moving = inp.gait !== 'none' && settled && this.at === 'stand';
    if (moving) {
      const run = inp.gait === 'run';
      this.phase += dt * inp.speed * (run ? 5.5 : 9);
      const amp = run ? 0.8 : 0.45;
      const offs = run ? [0, 0, Math.PI, Math.PI] : [0, Math.PI, Math.PI, 0];
      legs.forEach((l, i) => {
        l.swing += Math.sin(this.phase + offs[i]) * amp;
        l.knee -= Math.max(0, Math.cos(this.phase + offs[i])) * (run ? 1.0 : 0.6);
      });
      height += Math.abs(Math.sin(this.phase)) * (run ? 0.03 : 0.008);
      if (run) pitch += Math.sin(this.phase) * 0.08;
      spineYaw += clamp(-this.turn * 0.12, -0.6, 0.6);
      tail.sway *= run ? 0.4 : 1;
    }

    spinePitch += Math.sin(this.time * 2.2) * 0.012;                       // 숨쉬기
    if (!moving && eyes < 0.5) neckYaw += Math.sin(this.time * 0.37) * 0.12; // 두리번
    if (inp.lookYaw !== null) neckYaw += clamp(inp.lookYaw, -0.9, 0.9) * 0.8;
    if (settled && this.at === 'groom') {                                    // 핥기 반복
      neckPitch += Math.sin(this.time * 7) * 0.12;
      legs[0].swing += Math.sin(this.time * 7) * 0.12;
    }
    if (settled && this.at === 'crouch') rumpYaw = Math.sin(this.time * 11) * 0.18; // 엉덩이 씰룩
    if (inp.overlays.purr) { eyes = Math.max(eyes, 0.95); roll += Math.sin(this.time * 55) * 0.006; }
    if (inp.overlays.tailThump) tail.lift += Math.sin(this.time * 16) * 0.35;

    const R = this.rig;
    R.body.position.y = height;
    R.body.rotation.set(roll, 0, pitch);
    R.bones[0].rotation.set(0, rumpYaw, 0);
    for (let i = 1; i < SPINE_BONES; i++) R.bones[i].rotation.set(0, spineYaw / (SPINE_BONES - 1), spinePitch / (SPINE_BONES - 1));
    R.neck.rotation.set(0, neckYaw, neckPitch);
    legs.forEach((l, i) => {
      const g = R.legs[i];
      g.hip.rotation.set(-g.side * l.splay, 0, l.swing);
      g.knee.rotation.set(0, 0, l.knee);
    });
    R.ears.forEach((e, i) => { e.rotation.z = 0.2 + (inp.overlays.earTwitch ? Math.max(0, Math.sin(this.time * 30 + i * 2)) * 0.35 : 0); });
    R.setEyes(eyes);
    R.setTail(tailPoints(R.params, tail, this.time));
  }
}
```

`src/gallery.ts` (전체 교체):
```ts
// 개발용 자세 갤러리: http://localhost:1420/?gallery (Tauri 없이 일반 브라우저에서)
// 1행: 8개 자세 고정 / 2행: 걷기·뛰기·전환 순환·회전하며 걷기
import { CatView } from './render';
import { BER } from './cat/params';
import { Animator, NO_OVERLAYS, type Gait } from './cat/animator';
import { POSE_NAMES, type PoseName } from './cat/graph';

interface Cell { view: CatView; anim: Animator; label: HTMLDivElement; gait: Gait; cycle: boolean; spin: boolean; heading: number }

export function runGallery() {
  document.body.innerHTML = '';
  Object.assign(document.body.style, { background: 'linear-gradient(135deg,#eef2f7,#cdd8e6)', overflow: 'auto', fontFamily: 'sans-serif' });
  const grid = document.createElement('div');
  Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(4, 320px)', gap: '8px', padding: '12px' });
  document.body.appendChild(grid);
  const bg = document.createElement('button');
  bg.textContent = '배경 전환';
  Object.assign(bg.style, { position: 'fixed', top: '8px', right: '8px' });
  bg.onclick = () => { document.body.style.background = document.body.style.background.includes('#eef2f7') ? 'linear-gradient(135deg,#232b38,#0b0f15)' : 'linear-gradient(135deg,#eef2f7,#cdd8e6)'; };
  document.body.appendChild(bg);

  const cells: Cell[] = [];
  const add = (title: string, start: PoseName, gait: Gait = 'none', cycle = false, spin = false) => {
    const box = document.createElement('div');
    Object.assign(box.style, { position: 'relative', width: '320px', height: '240px', background: 'rgba(255,255,255,.25)', borderRadius: '8px' });
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '320px', height: '240px', display: 'block' });
    const label = document.createElement('div');
    Object.assign(label.style, { position: 'absolute', left: '8px', top: '6px', fontSize: '13px', color: '#333' });
    label.textContent = title;
    box.append(canvas, label);
    grid.appendChild(box);
    const view = new CatView(canvas, BER);
    view.resize(320, 240);
    const anim = new Animator(view.rig, start);
    cells.push({ view, anim, label, gait, cycle, spin, heading: Math.PI / 2 - 0.35 });
  };

  for (const n of POSE_NAMES) add(n, n);
  add('걷기', 'stand', 'walk');
  add('뛰기', 'stand', 'run');
  add('전환 순환 (3초마다)', 'stand', 'none', true);
  add('회전하며 걷기', 'stand', 'walk', false, true);

  let last = performance.now(), cycleT = 0, cycleI = 0;
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    cycleT += dt;
    if (cycleT > 3) { cycleT = 0; cycleI = (cycleI + 1) % POSE_NAMES.length; }
    for (const c of cells) {
      if (c.cycle) { c.anim.setTarget(POSE_NAMES[cycleI]); c.label.textContent = `전환 순환 → ${POSE_NAMES[cycleI]}`; }
      if (c.spin) c.heading += dt * 0.8;
      c.anim.update(dt, { gait: c.gait, speed: c.gait === 'run' ? 3 : 0.6, heading: c.heading, overlays: NO_OVERLAYS, lookYaw: null });
      c.view.place({ x: 160, y: 140 }, c.heading, 120);
      c.view.render();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
```

- [ ] **Step 6: 갤러리를 보며 자세 다듬기**

Run (백그라운드): `pnpm dev` → Playwright로 `http://localhost:1420/?gallery` 스크린샷(밝은/어두운 배경 각각).
Expected (각 칸을 보고 확인, 어긋나면 `poses.ts` 숫자와 `animator.ts`의 부호를 고친 뒤 다시 캡처):
- `stand`: 네 발이 바닥에 닿음. `sit`: 엉덩이가 바닥, 가슴이 들리고 앞다리가 곧게 바닥을 짚음.
- `loaf`: 다리가 몸 밑으로 사라지고 몸이 바닥에 붙음, 눈 반쯤 감김.
- `groom`: 앉은 자세에서 앞발 하나를 얼굴 쪽으로 들고 고개 숙여 핥는 반복.
- `lieSide`: 옆으로 누워 몸 옆면이 바닥에 닿음(몸이 바닥 아래로 파묻히지 않음).
- `curl`: 도넛처럼 말림, 꼬리가 몸을 감쌈, 눈 감김.
- `bellyUp`: 등이 바닥, 흰 턱받이가 위로 보임, 앞발 오므리고 뒷발 벌림.
- `crouch`: 몸을 낮추고 엉덩이가 좌우로 씰룩.
- 걷기: 대각선 다리 교대. 뛰기: 앞발 쌍·뒷발 쌍이 함께. 회전하며 걷기: 몸통이 도는 쪽으로 휨(반대로 휘면 `-this.turn`의 부호를 바꾼다).
- 전환 순환: 어떤 자세에서 다른 자세로 갈 때 몸이 꼬이거나 순간이동하지 않음.

다듬은 숫자는 `poses.ts`에만 반영하고, `pnpm test src/cat/poses.test.ts`가 계속 통과하는지 확인한다.

- [ ] **Step 7: 전체 테스트·타입체크 후 커밋**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 PASS

```bash
git add -A
git commit -m "feat: add poses, transition graph animation, gaits and pose gallery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 행동 AI (`Brain`)

**Files:**
- Create: `src/brain/rng.ts`, `src/brain/rng.test.ts`, `src/brain/presets.ts`, `src/brain/presets.test.ts`, `src/brain/brain.ts`, `src/brain/brain.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `MonitorInfo`, `WinInfo`, `monitorAt`, `clampToMonitors`, `bodyLenWorld`, `inset`, `dist`, `rectContains` (Task 2); `PoseName`, `transitionTime` (Task 4); `Gait`, `Overlays`, `NO_OVERLAYS` 타입은 brain이 자체 정의해 animator와 구조적으로 호환(brain은 three.js를 import하지 않으므로 animator를 import하지 않는다)
- Produces:
  - `rng.ts`: `interface Rng { next(): number }`, `mulberry32(seed: number): Rng`, `range(r, lo, hi)`, `chance(r, p)`, `pickWeighted<K extends string>(r, w: Record<K, number>): K`
  - `presets.ts`: `type Activity = 'calm'|'balanced'|'active'`, `type RestKind`, `type NextKind`, `PRESETS`, `weightsFor(a, last)`, `chooseNext(r, a, last)`, `SIZE_CSS = {small: 90, normal: 130, large: 180}`, `type SizeName`
  - `brain.ts`: `type Gait`, `interface Overlays`, `type Layer`, `interface CatState {pos; heading; pose; gait; speed; overlays; layer; lookAt; visible; behavior}`, `type Command`, `interface BrainInput {dt; cursor; windows; monitors; clicks; commands}`, `interface Settings {activity; bodyLengthCss}`, `class Brain { constructor(rng, settings, monitors); readonly state; step(input): CatState; walkTo(to: Vec2, run?: boolean) }`, `angleDiff(a, b)`, `approachAngle(a, b, maxStep)`

- [ ] **Step 1: RNG·프리셋 실패 테스트 작성**

`src/brain/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mulberry32, pickWeighted, range } from './rng';

describe('rng', () => {
  it('is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('picks by weight proportionally', () => {
    const r = mulberry32(7), counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20000; i++) counts[pickWeighted(r, { a: 1, b: 3, c: 0 })]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.7);
    expect(counts.b / counts.a).toBeLessThan(3.3);
  });
  it('ranges within bounds', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) { const v = range(r, 5, 9); expect(v).toBeGreaterThanOrEqual(5); expect(v).toBeLessThan(9); }
  });
});
```

`src/brain/presets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PRESETS, weightsFor, chooseNext, type NextKind } from './presets';
import { mulberry32 } from './rng';

describe('presets', () => {
  it('matches the spec table for calm', () => {
    expect(PRESETS.calm.weights).toEqual({ sleep: 45, loaf: 20, groom: 10, bellyUp: 5, wander: 15, zoomies: 5 });
    expect(PRESETS.calm.durations.sleep).toEqual([300, 1200]);
  });
  it('halves the weight of the previous behavior', () => {
    expect(weightsFor('balanced', 'wander').wander).toBe(15);
    expect(weightsFor('balanced', null).wander).toBe(30);
  });
  it('produces the calm distribution within 2 percentage points', () => {
    const r = mulberry32(3), n = 40000;
    const counts: Record<NextKind, number> = { sleep: 0, loaf: 0, groom: 0, bellyUp: 0, wander: 0, zoomies: 0 };
    for (let i = 0; i < n; i++) counts[chooseNext(r, 'calm', null)]++;
    expect(counts.sleep / n).toBeCloseTo(0.45, 1);
    expect(Math.abs(counts.sleep / n - 0.45)).toBeLessThan(0.02);
    expect(Math.abs(counts.wander / n - 0.15)).toBeLessThan(0.02);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test src/brain`
Expected: FAIL — `Failed to resolve import "./rng"` / `"./presets"`

- [ ] **Step 3: RNG·프리셋 구현**

`src/brain/rng.ts`:
```ts
export interface Rng { next(): number } // [0, 1)

/** 시드 고정 가능한 작은 PRNG (테스트 재현용) */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const range = (r: Rng, lo: number, hi: number): number => lo + (hi - lo) * r.next();
export const chance = (r: Rng, p: number): boolean => r.next() < p;

export function pickWeighted<K extends string>(r: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r.next() * total;
  for (const [k, w] of entries) { x -= w; if (x < 0) return k; }
  return entries[entries.length - 1][0];
}
```

`src/brain/presets.ts`:
```ts
// 활동량 프리셋 (spec §6.2). 수치를 바꿀 땐 이 파일만 고친다.
import { pickWeighted, type Rng } from './rng';

export type Activity = 'calm' | 'balanced' | 'active';
export type RestKind = 'sleep' | 'loaf' | 'groom' | 'bellyUp';
export type NextKind = RestKind | 'wander' | 'zoomies';

export interface Preset {
  weights: Record<NextKind, number>;
  durations: Record<RestKind, [number, number]>; // 초
  wakeOnCursorPerSec: number;                     // 계획 B에서 사용
}

export const PRESETS: Record<Activity, Preset> = {
  calm: {
    weights: { sleep: 45, loaf: 20, groom: 10, bellyUp: 5, wander: 15, zoomies: 5 },
    durations: { sleep: [300, 1200], loaf: [120, 480], groom: [20, 60], bellyUp: [20, 90] },
    wakeOnCursorPerSec: 0.03,
  },
  balanced: {
    weights: { sleep: 25, loaf: 15, groom: 15, bellyUp: 5, wander: 30, zoomies: 10 },
    durations: { sleep: [180, 600], loaf: [60, 300], groom: [20, 60], bellyUp: [20, 90] },
    wakeOnCursorPerSec: 0.08,
  },
  active: {
    weights: { sleep: 10, loaf: 10, groom: 15, bellyUp: 5, wander: 40, zoomies: 20 },
    durations: { sleep: [60, 240], loaf: [60, 180], groom: [20, 60], bellyUp: [20, 90] },
    wakeOnCursorPerSec: 0.15,
  },
};

/** 직전 행동의 가중치를 절반으로 낮춰 같은 행동이 연속되는 걸 줄인다 */
export function weightsFor(a: Activity, last: NextKind | null): Record<NextKind, number> {
  const w = { ...PRESETS[a].weights };
  if (last) w[last] /= 2;
  return w;
}

export const chooseNext = (r: Rng, a: Activity, last: NextKind | null): NextKind => pickWeighted(r, weightsFor(a, last));

export const SIZE_CSS = { small: 90, normal: 130, large: 180 } as const;
export type SizeName = keyof typeof SIZE_CSS;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test src/brain`
Expected: 6 tests PASS

- [ ] **Step 5: Brain 실패 테스트 작성 (Review Focus 2~5 포함)**

`src/brain/brain.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Brain, angleDiff, type BrainInput, type Settings } from './brain';
import { mulberry32 } from './rng';
import { rectContains, type MonitorInfo, type Vec2 } from '../world';
import { transitionTime } from '../cat/graph';

const main: MonitorInfo = { id: '1', rect: { x: 0, y: 0, w: 1920, h: 1080 }, cssPerWorld: 1, primary: true };
const left: MonitorInfo = { id: '2', rect: { x: -1920, y: 100, w: 1920, h: 1080 }, cssPerWorld: 1, primary: false };
const settings = (activity: Settings['activity'] = 'calm'): Settings => ({ activity, bodyLengthCss: 130 });
const input = (monitors: MonitorInfo[], dt = 1 / 30): BrainInput => ({ dt, cursor: null, windows: [], monitors, clicks: 0, commands: [] });
const inside = (p: Vec2, ms: MonitorInfo[]) => ms.some((m) => rectContains({ x: m.rect.x - 1, y: m.rect.y - 1, w: m.rect.w + 2, h: m.rect.h + 2 }, p));

describe('Brain', () => {
  it('starts loafing on the primary monitor', () => {
    const b = new Brain(mulberry32(1), settings(), [left, main]);
    expect(b.state.pose).toBe('loaf');
    expect(inside(b.state.pos, [main])).toBe(true);
  });

  it('stands up before walking and then reaches the target', () => {
    const b = new Brain(mulberry32(2), settings(), [main]);
    const target = { x: b.state.pos.x + 400, y: b.state.pos.y };
    b.walkTo(target);
    const s1 = b.step(input([main]));
    expect(s1.pose).toBe('stand');
    expect(s1.gait).toBe('none');
    // 일어서는 동안은 제자리
    const start = { ...s1.pos };
    for (let t = 0; t < transitionTime('loaf', 'stand') - 0.1; t += 1 / 30) b.step(input([main]));
    expect(Math.hypot(b.state.pos.x - start.x, b.state.pos.y - start.y)).toBeLessThan(1);
    // 걷기 속도 0.6 몸길이/초 → 400px은 약 5초. 여유 있게 15초
    let arrived = false;
    for (let t = 0; t < 15 && !arrived; t += 1 / 30) {
      const s = b.step(input([main]));
      if (Math.hypot(s.pos.x - target.x, s.pos.y - target.y) < 20) arrived = true;
    }
    expect(arrived).toBe(true);
  });

  it('faces toward where it walks', () => {
    const b = new Brain(mulberry32(3), settings(), [main]);
    b.walkTo({ x: b.state.pos.x, y: b.state.pos.y + 500 });
    for (let t = 0; t < 3; t += 1 / 30) b.step(input([main]));
    expect(Math.abs(angleDiff(b.state.heading, Math.PI / 2))).toBeLessThan(0.3);
  });

  it('rests only inside monitors and never leaves their bounding box for 2 simulated hours (Review Focus 5)', () => {
    const ms = [left, main];
    const box = { x: -1920, y: 0, w: 3840, h: 1180 };
    const b = new Brain(mulberry32(4), settings('active'), ms);
    for (let i = 0; i < 2 * 3600 * 15; i++) {
      const s = b.step(input(ms, 1 / 15));
      const ok = Number.isFinite(s.heading) && inside(s.pos, [{ ...main, rect: box }]) && (s.gait !== 'none' || inside(s.pos, ms));
      if (!ok) throw new Error(`bad state at step ${i}: ${JSON.stringify(s)}`);
    }
  }, 30000);

  it('survives a huge dt without leaving monitors or producing NaN (Review Focus 3)', () => {
    const b = new Brain(mulberry32(5), settings('active'), [main]);
    for (let i = 0; i < 20; i++) {
      const s = b.step(input([main], 30));
      expect(Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y)).toBe(true);
      expect(inside(s.pos, [main])).toBe(true);
    }
  });

  it('moves into a remaining monitor when its monitor disappears (Review Focus 2)', () => {
    const b = new Brain(mulberry32(6), settings(), [left, main]);
    b.walkTo({ x: -900, y: 600 });
    for (let t = 0; t < 60; t += 1 / 30) b.step(input([left, main]));
    expect(inside(b.state.pos, [left])).toBe(true);
    const s = b.step(input([main]));
    expect(inside(s.pos, [main])).toBe(true);
  });

  it('does not throw with an empty monitor list at startup (Review Focus 4)', () => {
    const b = new Brain(mulberry32(7), settings(), []);
    for (let i = 0; i < 100; i++) b.step(input([]));
    expect(Number.isFinite(b.state.pos.x)).toBe(true);
    const s = b.step(input([main]));
    expect(inside(s.pos, [main])).toBe(true);
  });

  it('eventually sleeps in a resting pose under the calm preset', () => {
    const b = new Brain(mulberry32(8), settings('calm'), [main]);
    let slept = false;
    for (let i = 0; i < 30 * 60 * 15 && !slept; i++) {
      const s = b.step(input([main], 1 / 15));
      if (s.behavior === 'sleep' && (s.pose === 'curl' || s.pose === 'lieSide') && s.gait === 'none') slept = true;
    }
    expect(slept).toBe(true);
  });

  it('applies setActivity commands', () => {
    const b = new Brain(mulberry32(9), settings('calm'), [main]);
    b.step({ ...input([main]), commands: [{ type: 'setActivity', activity: 'active' }] });
    expect(b.settings.activity).toBe('active');
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm test src/brain/brain.test.ts`
Expected: FAIL — `Failed to resolve import "./brain"`

- [ ] **Step 7: Brain 구현**

`src/brain/brain.ts`:
```ts
// 베르의 두뇌: 작업 큐(자세 전환 → 걷기 → 머물기)를 처리하고, 비면 활동량 프리셋으로 다음 행동을 고른다.
// three.js·Tauri에 의존하지 않는다. 모든 좌표는 월드 좌표.
import { clampToMonitors, bodyLenWorld, dist, inset, monitorAt, type MonitorInfo, type Vec2, type WinInfo } from '../world';
import { chance, range, type Rng } from './rng';
import { chooseNext, PRESETS, type Activity, type NextKind, type RestKind } from './presets';
import { transitionTime, type PoseName } from '../cat/graph';

export type Gait = 'none' | 'walk' | 'run';
export interface Overlays { purr: boolean; tailThump: boolean; earTwitch: boolean }
export type Layer = { kind: 'top' } | { kind: 'under'; windowId: number };
export interface CatState {
  pos: Vec2;
  heading: number;      // 화면 기준 라디안 (y 아래로)
  pose: PoseName;       // 목표 자세
  gait: Gait;
  speed: number;        // 몸길이/초
  overlays: Overlays;
  layer: Layer;
  lookAt: Vec2 | null;
  visible: boolean;
  behavior: string;
}
export type Command =
  | { type: 'summon' } | { type: 'hide' } | { type: 'show' }
  | { type: 'setActivity'; activity: Activity }
  | { type: 'setSize'; bodyLengthCss: number };
export interface BrainInput { dt: number; cursor: Vec2 | null; windows: WinInfo[]; monitors: MonitorInfo[]; clicks: number; commands: Command[] }
export interface Settings { activity: Activity; bodyLengthCss: number }

type Task =
  | { t: 'pose'; pose: PoseName; left: number; started: boolean }
  | { t: 'walk'; to: Vec2; run: boolean }
  | { t: 'hold'; pose: PoseName; left: number };

const WALK_SPEED = 0.6, RUN_SPEED = 3.0;   // 몸길이/초
const TURN_RATE = { walk: 4, run: 7 };      // rad/초
const MAX_STEP_DT = 0.1;                    // 큰 dt는 잘게 나눠 처리

export const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const approachAngle = (a: number, b: number, maxStep: number): number => {
  const d = angleDiff(a, b);
  return a + Math.max(-maxStep, Math.min(maxStep, d));
};

const noOverlays = (): Overlays => ({ purr: false, tailThump: false, earTwitch: false });
const pose = (p: PoseName): Task => ({ t: 'pose', pose: p, left: 0, started: false });

export class Brain {
  private s: CatState;
  private queue: Task[] = [];
  private last: NextKind | null = null;
  private monitors: MonitorInfo[];

  constructor(private rng: Rng, public settings: Settings, monitors: MonitorInfo[]) {
    this.monitors = monitors;
    const m = monitors.find((x) => x.primary) ?? monitors[0];
    const start = m ? { x: m.rect.x + m.rect.w / 2, y: m.rect.y + m.rect.h * 0.6 } : { x: 0, y: 0 };
    this.s = {
      pos: start, heading: Math.PI / 2, pose: 'loaf', gait: 'none', speed: 0,
      overlays: noOverlays(), layer: { kind: 'top' }, lookAt: null, visible: true, behavior: 'loaf',
    };
    this.queue = [{ t: 'hold', pose: 'loaf', left: range(rng, 5, 15) }];
  }

  get state(): CatState { return this.s; }

  /** 진행 중인 행동을 버리고 목적지로 간다 (테스트·이리 와 명령용) */
  walkTo(to: Vec2, run = false) {
    this.queue = [{ t: 'walk', to, run }];
    this.s.behavior = run ? 'run' : 'walk';
  }

  step(input: BrainInput): CatState {
    if (input.monitors.length) this.syncMonitors(input.monitors);
    for (const c of input.commands) this.handle(c);
    this.s.gait = 'none';
    this.s.speed = 0;
    this.s.overlays = noOverlays();
    if (!this.monitors.length) return this.s;

    let remaining = Math.max(0, input.dt);
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_STEP_DT);
      remaining -= dt;
      this.advance(dt);
    }
    return this.s;
  }

  private syncMonitors(ms: MonitorInfo[]) {
    const appeared = this.monitors.length === 0;
    this.monitors = ms;
    if (appeared || !monitorAt(this.s.pos, ms)) {
      // 처음 모니터를 알게 됐거나 있던 모니터가 사라짐 → 남은 모니터 안으로
      const m = ms.find((x) => x.primary) ?? ms[0];
      this.s.pos = appeared ? { x: m.rect.x + m.rect.w / 2, y: m.rect.y + m.rect.h * 0.6 } : clampToMonitors(this.s.pos, ms, this.margin(m));
      this.queue = this.queue.filter((t) => t.t !== 'walk');
    }
  }

  private handle(c: Command) {
    if (c.type === 'setActivity') this.settings = { ...this.settings, activity: c.activity };
    if (c.type === 'setSize') this.settings = { ...this.settings, bodyLengthCss: c.bodyLengthCss };
    // summon / hide / show 는 계획 B에서 구현
  }

  /** dt 동안 작업을 진행한다. 한 작업이 끝나면 남은 시간으로 다음 작업을 이어간다. */
  private advance(dt: number) {
    for (let guard = 0; guard < 8 && dt > 0; guard++) {
      if (!this.queue.length) this.planNext();
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
        task.left -= dt;
        return task.left <= 0 ? -task.left : null;
      }
      case 'walk': {
        if (this.s.pose !== 'stand') { this.queue.unshift(pose('stand')); return null; }
        return this.walk(task, dt);
      }
    }
  }

  private walk(task: Extract<Task, { t: 'walk' }>, dt: number): number | null {
    const m = monitorAt(this.s.pos, this.monitors) ?? this.monitors[0];
    const L = bodyLenWorld(this.settings.bodyLengthCss, m);
    const base = task.run ? RUN_SPEED : WALK_SPEED;
    const d = dist(this.s.pos, task.to);
    if (d < L * 0.1) return dt;
    const want = Math.atan2(task.to.y - this.s.pos.y, task.to.x - this.s.pos.x);
    this.s.heading = approachAngle(this.s.heading, want, (task.run ? TURN_RATE.run : TURN_RATE.walk) * dt);
    // 가까우면 곧장 다가간다(목표 주위를 맴도는 것 방지), 멀면 몸이 향한 쪽으로 걷되 많이 틀어졌으면 감속
    const dir = d < L * 0.6 ? want : this.s.heading;
    const facing = Math.max(0.2, Math.cos(angleDiff(this.s.heading, want)));
    const stepLen = Math.min(d, base * L * dt * facing);
    // 목적지는 항상 모니터 안이므로, 가는 길에 모니터 사이 빈 공간을 지나는 것은 허용한다(그동안 안 보임)
    this.s.pos = { x: this.s.pos.x + Math.cos(dir) * stepLen, y: this.s.pos.y + Math.sin(dir) * stepLen };
    this.s.gait = task.run ? 'run' : 'walk';
    this.s.speed = base * facing;
    return null;
  }

  private planNext() {
    const kind = chooseNext(this.rng, this.settings.activity, this.last);
    this.last = kind;
    this.s.behavior = kind;
    const P = PRESETS[this.settings.activity];
    const dur = (k: RestKind) => range(this.rng, P.durations[k][0], P.durations[k][1]);
    const rest = (p: PoseName, seconds: number) => this.queue.push(pose(p), { t: 'hold', pose: p, left: seconds });
    switch (kind) {
      case 'wander':
        this.queue.push({ t: 'walk', to: this.randomPoint(), run: false });
        break;
      case 'zoomies': {
        let from = this.s.pos;
        const hops = 2 + Math.floor(this.rng.next() * 3);
        for (let i = 0; i < hops; i++) { const to = this.nearbyPoint(from, 4); this.queue.push({ t: 'walk', to, run: true }); from = to; }
        break;
      }
      case 'sleep':
        this.queue.push({ t: 'walk', to: this.sleepSpot(), run: false });
        rest(chance(this.rng, 0.5) ? 'curl' : 'lieSide', dur('sleep'));
        break;
      case 'loaf':
        if (chance(this.rng, 0.5)) this.queue.push({ t: 'walk', to: this.randomPoint(), run: false });
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

  private margin(m: MonitorInfo): number { return bodyLenWorld(this.settings.bodyLengthCss, m) * 1.2; }

  private current(): MonitorInfo { return monitorAt(this.s.pos, this.monitors) ?? this.monitors[0]; }

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

  /** 방해가 덜한 곳: 지금 모니터의 모서리 또는 아래쪽 가장자리 (창 위 자리는 계획 B) */
  private sleepSpot(): Vec2 {
    const m = this.current();
    const r = inset(m.rect, this.margin(m));
    if (chance(this.rng, 0.5)) return { x: chance(this.rng, 0.5) ? r.x : r.x + r.w, y: chance(this.rng, 0.5) ? r.y : r.y + r.h };
    return { x: r.x + this.rng.next() * r.w, y: r.y + r.h };
  }
}
```

- [ ] **Step 8: 통과 확인**

Run: `pnpm test src/brain && pnpm typecheck`
Expected: rng 3 + presets 3 + brain 9 = 15 tests PASS (2시간 시뮬레이션은 수 초 걸린다).

- [ ] **Step 9: 커밋**

```bash
git add src/brain
git commit -m "feat: add Ber brain with activity presets and task queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 오버레이 통합 (두뇌·방송·렌더·프레임 조절)

**Files:**
- Create: `src/overlay.ts`
- Modify: `src/main.ts` (전체 교체)
- Delete: `src/debug-overlay.ts`

**Interfaces:**
- Consumes: `bridge` (Task 3), `CatView` (Task 4), `Animator`, `NO_OVERLAYS` (Task 5), `Brain`, `CatState`, `Settings`, `mulberry32`, `SIZE_CSS` (Task 6), `worldToLocal`, `MonitorInfo`, `Vec2` (Task 2), `BER`
- Produces: `runOverlay(): Promise<void>` — 계획 B가 커서·클릭·창 입력을 여기에 연결한다.

- [ ] **Step 1: 오버레이 루프 작성**

`src/overlay.ts`:
```ts
// 오버레이 웹뷰: 주 모니터면 두뇌를 돌려 상태를 방송하고, 모든 웹뷰는 자기 모니터에 베르가 있으면 그린다.
import { bridge } from './bridge';
import { CatView } from './render';
import { BER } from './cat/params';
import { Animator } from './cat/animator';
import { Brain, type CatState, type Settings } from './brain/brain';
import { mulberry32 } from './brain/rng';
import { SIZE_CSS } from './brain/presets';
import { worldToLocal, type MonitorInfo, type Vec2 } from './world';

const ACTIVE_FPS = 60, REST_FPS = 15;

export async function runOverlay() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const monitors = await bridge.getMonitors();
  const base = monitors.find((m) => m.id === bridge.monitorId) ?? monitors[0];
  const origin = await bridge.windowOriginWorld();
  // OS가 창을 옮겼을 수 있으니 실제 창 원점을 기준으로 변환한다
  const me: MonitorInfo = { ...base, rect: { ...base.rect, x: origin.x, y: origin.y } };

  const view = new CatView(canvas, BER);
  const resize = () => view.resize(innerWidth, innerHeight);
  resize();
  addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', () => location.reload());

  const settings: Settings = { activity: 'calm', bodyLengthCss: SIZE_CSS.normal };
  const animator = new Animator(view.rig, 'loaf');
  let state: CatState | null = null;
  let cursor: Vec2 | null = null;
  await bridge.onCursor((p) => { cursor = p; });

  const brain = me.primary ? new Brain(mulberry32((Math.random() * 2 ** 32) >>> 0), settings, monitors) : null;
  if (!brain) await bridge.onCatState<CatState>((s) => { state = s; });

  let last = performance.now(), lastRender = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (brain) state = brain.step({ dt, cursor, windows: [], monitors, clicks: 0, commands: [] });
    if (!state) return;

    const busy = state.gait !== 'none' || animator.transitioning || state.pose !== animator.pose || state.overlays.purr || state.overlays.tailThump || state.overlays.earTwitch;
    if (now - lastRender < 1000 / (busy ? ACTIVE_FPS : REST_FPS) - 2) return;
    const adt = Math.min((now - lastRender) / 1000, 0.1);
    lastRender = now;
    if (brain) void bridge.sendCatState(state);

    animator.setTarget(state.pose);
    animator.update(adt, { gait: state.gait, speed: state.speed, heading: state.heading, overlays: state.overlays, lookYaw: null });
    view.place(worldToLocal(state.pos, me), state.heading, settings.bodyLengthCss);
    if (state.visible) view.render(); else view.clear();
  };
  requestAnimationFrame(loop);
}
```

`src/main.ts` (전체 교체):
```ts
import { runGallery } from './gallery';
import { runOverlay } from './overlay';

if (new URLSearchParams(location.search).has('gallery')) runGallery();
else void runOverlay();
```

Run: `rm src/debug-overlay.ts && pnpm typecheck && pnpm test`
Expected: 타입 오류 없음, 전체 테스트 PASS

- [ ] **Step 2: 실제 실행 확인**

Run (백그라운드): `pnpm tauri dev`
그다음 30초 간격으로 `screencapture -x /tmp/ber-<n>.png` 여러 장 캡처해 확인. 빨리 보려면 `src/overlay.ts`의 `settings.activity`를 임시로 `'active'`로 바꿔 확인한 뒤 되돌린다.
Expected:
- 주 모니터에 베르가 식빵 자세로 나타나고, 잠시 뒤 일어나서 걷거나 다른 행동을 한다.
- 걷다가 보조 모니터로 넘어가면 그쪽 웹뷰에 이어서 그려지고, 떠난 모니터에는 잔상이 남지 않는다.
- 베르가 있는 곳 위에서도 아래 앱 클릭이 그대로 된다(계획 A는 전부 클릭 통과).
- 쉬는 중(잠·식빵) `ps -o %cpu -p $(pgrep -f 'target/debug/ber')`가 디버그 빌드 기준 10% 미만. (릴리스 기준 5% 미만 목표는 계획 C의 릴리스 빌드에서 재측정)

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "feat: run brain on primary overlay and broadcast cat state to all monitors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## 계획 A 완료 기준
- `pnpm test` 전체 통과, `pnpm typecheck`, `cargo test` 통과
- 갤러리에서 8개 자세·전환·걷기·뛰기가 자연스럽다
- 실제 데스크톱에서 베르가 활동량 프리셋대로 쉬고 돌아다니며 여러 모니터를 오간다
- 클릭이 전부 통과하고, 트레이 "종료"로 끝난다
