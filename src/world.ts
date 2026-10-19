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

export function rectToLocal(r: Rect, m: MonitorInfo): Rect {
  const p = worldToLocal(r, m);
  return { x: p.x, y: p.y, w: r.w * m.cssPerWorld, h: r.h * m.cssPerWorld };
}

export const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

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

/** 모니터 구성(id·위치·크기·배율)이 같은지. 매 프레임 같은 목록이 와도 구성 변화로 오인하지 않기 위해 쓴다. */
export function sameMonitors(a: MonitorInfo[], b: MonitorInfo[]): boolean {
  return a.length === b.length && a.every((m, i) => {
    const n = b[i];
    return m.id === n.id && m.cssPerWorld === n.cssPerWorld && m.primary === n.primary &&
      m.rect.x === n.rect.x && m.rect.y === n.rect.y && m.rect.w === n.rect.w && m.rect.h === n.rect.h;
  });
}
