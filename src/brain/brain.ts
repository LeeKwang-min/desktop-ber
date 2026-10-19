// 베르의 두뇌 (순수 TS, three.js·Tauri 의존 없음). 모든 좌표는 월드 좌표.
// 작업 큐(자세 전환 → 걷기 → 머물기)를 처리하고, 비면 활동량 프리셋으로 다음 행동을 고른다.
// 커서·클릭·트레이 명령에는 진행 중인 작업을 끊고 반응한다 (spec §6.4~6.7).
import { clampToMonitors, bodyLenWorld, dist, inset, monitorAt, rectContains, sameMonitors, sameRect, type MonitorInfo, type Rect, type Vec2, type WinInfo } from '../world';
import { chance, range, type Rng } from './rng';
import { chooseNext, PRESETS, type Activity, type NextKind, type RestKind } from './presets';
import { POSE_NAMES, transitionTime, type PoseName } from '../cat/graph';
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
  | { t: 'visible'; visible: boolean }
  | { t: 'attach'; windowId: number; rect: Rect }     // 이 창에 붙어서 같이 움직인다 (낮잠). rect: 계획할 때의 창 위치
  | { t: 'detach' }
  | { t: 'layer'; under: number | null; rect?: Rect; outside?: Vec2 }; // null이면 top. rect·outside: 계획할 때의 창 위치·접근점

const WALK_SPEED = 0.6, RUN_SPEED = 3.0;   // 몸길이/초
const TURN_RATE = { walk: 4, run: 7 };      // rad/초
const MAX_STEP_DT = 0.1;                    // 큰 dt는 잘게 나눠 처리
// 커서 반응 (spec §6.4). 속도는 CSS px/초, 거리는 몸길이 단위
const CHASE_SPEED = 600, MOVING_SPEED = 100, STILL_SPEED = 30;
const CHASE_RADIUS = 6, SNIFF_RADIUS = 4, EAR_RADIUS = 3, GIVE_UP_RADIUS = 10;
const CHASE_MAX_SEC = 20, CHASE_COOLDOWN = 15, STILL_BEFORE_SNIFF = 3, STILL_ENDS_CHASE = 1;
// 클릭 반응 (spec §6.5)
const CLICK_WINDOW = 5, CLICKS_TO_ANNOY = 5, ANNOYED_IGNORE = 10;
// 커서 앞에서 멈출 때: 코는 몸 중심보다 앞으로 0.54 몸길이, 38° 시점에선 머리가 화면에서 0.22 몸길이 위로 보인다
// (cat/params의 머리 위치·높이에서 나온 값. 외형을 바꾸면 sniff-distance 테스트가 알려준다)
const NOSE_AHEAD = 0.54, HEAD_RISE = 0.22, SNOUT_GAP_CSS = 30;
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

/** localStorage에서 읽은 값이라 모양을 믿지 않는다 (깨지면 베르가 영영 안 나타나는 것 방지) */
function validSnapshot(r: Snapshot | null | undefined): r is Snapshot {
  return !!r && !!r.pos && Number.isFinite(r.pos.x) && Number.isFinite(r.pos.y) && Number.isFinite(r.heading) && POSE_NAMES.includes(r.pose);
}

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
  private windows: WinInfo[] = [];
  private nap: { id: number; rect: Rect } | null = null;    // 붙어서 자는 창
  private under: { id: number; rect: Rect } | null = null;  // 밑에 숨은 창

  constructor(private rng: Rng, public settings: Settings, monitors: MonitorInfo[], opts: BrainOptions = {}) {
    this.monitors = monitors;
    const restore = validSnapshot(opts.restore) && monitorAt(opts.restore.pos, monitors) ? opts.restore : null;
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
    this.interrupt(run ? 'run' : 'walk', [{ t: 'walk', to, run }]);
  }

  step(input: BrainInput): CatState {
    if (input.monitors.length && !sameMonitors(input.monitors, this.monitors)) this.syncMonitors(input.monitors);
    this.observeCursor(input.cursor, input.dt);
    this.windows = input.windows;
    this.trackWindows();
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

  // ── 창 ─────────────────────────────────────────────────

  /** 진행 중인 행동을 끊고 새 작업으로. 창에 붙어 있던 것·숨어 있던 것도 끝낸다 (Review Focus 1). */
  private interrupt(behavior: string, tasks: Task[]) {
    this.nap = null;
    if (this.under) { this.under = null; this.s.layer = { kind: 'top' }; }
    this.s.behavior = behavior;
    this.queue = tasks;
  }

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
        this.interrupt('summoned', [{ t: 'walk', to: spot, run: true, label: 'summoned' }, pose('sit'), { t: 'hold', pose: 'sit', left: 4, overlays: { purr: true }, look: 'cursor', label: 'summoned' }]);
        break;
      }
      case 'hide':
        if (this.hidden || !this.monitors.length) break;
        this.interrupt('leaving', [{ t: 'walk', to: this.exitPoint(this.s.pos), run: false, label: 'leaving' }, { t: 'visible', visible: false }]);
        break;
      case 'show':
        if (!this.hidden && this.s.behavior === 'leaving') { this.interrupt('wander', []); break; } // 나가던 중이면 취소
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
    if (this.hidden || this.s.behavior === 'leaving' || this.time < this.clicksIgnoredUntil) return;
    for (let i = 0; i < n; i++) this.clickTimes.push(this.time);
    this.clickTimes = this.clickTimes.filter((t) => this.time - t <= CLICK_WINDOW);
    if (this.clickTimes.length >= CLICKS_TO_ANNOY) {
      this.clickTimes = [];
      this.clicksIgnoredUntil = this.time + ANNOYED_IGNORE;
      this.interrupt('annoyed', [
        { t: 'hold', pose: this.s.pose, left: 1.5, overlays: { tailThump: true }, label: 'annoyed' },
        { t: 'walk', to: this.randomPoint(), run: false, label: 'wander' },
      ]);
      return;
    }
    if (this.s.behavior === 'sleep') { this.purr('loaf'); return; }
    const r = this.rng.next();
    if (r < 0.2 && LYING.includes(this.s.pose)) {
      this.interrupt('bellyUp', [pose('bellyUp'), { t: 'hold', pose: 'bellyUp', left: range(this.rng, 20, 40), label: 'bellyUp' }]);
    } else if (r >= 0.2 && r < 0.3) {
      this.interrupt('tailThump', [{ t: 'hold', pose: this.s.pose, left: 1.5, overlays: { tailThump: true }, label: 'tailThump' }]);
    } else {
      this.purr(this.s.pose === 'stand' || this.s.pose === 'crouch' ? 'sit' : this.s.pose);
    }
  }

  private purr(p: PoseName) {
    this.interrupt('purr', [pose(p), { t: 'hold', pose: p, left: range(this.rng, 3, 6), overlays: { purr: true }, label: 'purr' }]);
  }

  private reactToCursor(dt: number) {
    const c = this.cursor;
    // 숨었거나, 귀찮아서 자리를 뜬 뒤 10초 동안은 커서를 무시한다 (spec §6.5 '다른 곳으로')
    if (!c || this.hidden || this.time < this.clicksIgnoredUntil) return;
    const d = dist(c, this.s.pos) / this.L();
    const b = this.s.behavior;
    if (b === 'sleep') {
      if (d < EAR_RADIUS && this.cursorSpeed > MOVING_SPEED) {
        this.s.overlays.earTwitch = true;
        if (chance(this.rng, PRESETS[this.settings.activity].wakeOnCursorPerSec * dt)) {
          this.interrupt('loaf', [pose('loaf'), { t: 'hold', pose: 'loaf', left: range(this.rng, 2, 5), label: 'loaf' }]);
        }
      }
      return;
    }
    if (!INTERRUPTIBLE.has(b)) return;
    if (this.time >= this.chaseReadyAt && d < CHASE_RADIUS && this.cursorSpeed >= CHASE_SPEED) {
      this.interrupt('stalk', [pose('crouch'), { t: 'hold', pose: 'crouch', left: range(this.rng, 0.5, 1.5), look: 'cursor', label: 'stalk' }, { t: 'chase', left: CHASE_MAX_SEC }]);
    } else if (!this.sniffedThisStill && d < SNIFF_RADIUS && this.cursorStill >= STILL_BEFORE_SNIFF) {
      this.sniffedThisStill = true;
      this.interrupt('sniff', this.sniffTasks(c));
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
      case 'attach': {
        // 걸어오는 동안 창이 움직였거나 앞 창에 가려졌으면 붙지 않고 그 자리에서 그냥 잔다 (review fix)
        const w = this.windows.find((x) => x.id === task.windowId);
        this.nap = w && sameRect(w.rect, task.rect) && !this.coveredInFront(w.id, this.s.pos) ? { id: w.id, rect: w.rect } : null;
        return dt;
      }
      case 'detach':
        this.nap = null;
        return dt;
      case 'layer': {
        if (task.under === null) { this.under = null; this.s.layer = { kind: 'top' }; return dt; }
        const w = this.windows.find((x) => x.id === task.under);
        const stillThere = !!w && !!task.rect && sameRect(w.rect, task.rect);
        const atEdge = !!task.outside && dist(this.s.pos, task.outside) < 0.5 * this.L() && !this.coveredInFront(task.under, task.outside);
        // 걸어오는 동안 창이 움직이거나 사라졌거나 앞 창에 가려졌으면 숨기를 포기한다 (이 작업만 남기고 비움, review fix)
        if (!w || !stillThere || !atEdge) { this.queue = this.queue.slice(0, 1); return dt; }
        this.under = { id: w.id, rect: w.rect };
        this.s.layer = { kind: 'under', windowId: w.id };
        return dt;
      }
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
      if (c && !far) { this.sniffedThisStill = true; this.queue.splice(1, 0, ...this.sniffTasks(c)); }
      return 0;
    }
    if (this.s.pose !== 'stand') return this.standUpFirst(dt);
    this.s.lookAt = c;
    this.moveToward(this.snoutStop(c), true, dt);
    return null;
  }

  /** 커서 앞에서 멈출 몸 위치: 코끝이 커서에서 SNOUT_GAP_CSS만큼 떨어지게 (사용자 선택: 코끝이 커서 바로 앞까지).
   *  커서를 덮으면 다음 클릭이 앱 대신 베르에게 간다. 이미 그보다 가까우면 제자리. */
  private snoutStop(c: Vec2): Vec2 {
    const L = this.L(), d = dist(c, this.s.pos);
    const back = NOSE_AHEAD * L + SNOUT_GAP_CSS / this.cssPerWorld();
    if (d <= back) return { ...this.s.pos };
    const ux = (c.x - this.s.pos.x) / d, uy = (c.y - this.s.pos.y) / d;
    return { x: c.x - ux * back, y: c.y - uy * back + HEAD_RISE * L };
  }

  private sniffTasks(c: Vec2): Task[] {
    return [
      { t: 'walk', to: this.snoutStop(c), run: false, label: 'sniff' },
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
      case 'zoomies': {
        let from = this.s.pos;
        const hops = 2 + Math.floor(this.rng.next() * 3);
        for (let i = 0; i < hops; i++) { const to = this.nearbyPoint(from, 4); this.queue.push({ t: 'walk', to, run: true, label: 'zoomies' }); from = to; }
        break;
      }
      case 'wander': {
        const h = chance(this.rng, 0.3) ? this.hideTarget() : null;
        if (!h) { this.queue.push({ t: 'walk', to: this.randomPoint(), run: false, label: 'wander' }); break; }
        const stay = range(this.rng, 10, 60);
        this.queue.push(
          { t: 'walk', to: h.outside, run: false, label: 'wander' },
          { t: 'layer', under: h.id, rect: h.rect, outside: h.outside },
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
          this.queue.push({ t: 'walk', to: n.spot, run: false, label: 'wander' }, { t: 'attach', windowId: n.id, rect: n.rect });
          rest(p, dur('sleep'));
          this.queue.push({ t: 'detach' });
        } else {
          this.queue.push({ t: 'walk', to: this.sleepSpot(), run: false, label: 'wander' });
          rest(p, dur('sleep'));
        }
        break;
      }
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

  /** 창 id보다 앞에 있는 창 중 하나가 점 p를 덮는지 */
  private coveredInFront(id: number, p: Vec2): boolean {
    const i = this.windows.findIndex((w) => w.id === id);
    return this.windows.slice(0, i < 0 ? 0 : i).some((w) => rectContains(w.rect, p));
  }

  /** 창 크기 조건: 너비 3·높이 2 몸길이 이상 */
  private bigEnough(r: Rect): boolean {
    const L = this.L();
    return r.w >= 3 * L && r.h >= 2 * L;
  }

  /** 제목 표시줄 위 낮잠 자리. 앞 창에 가려진 곳은 제외 */
  private napSpot(): { id: number; rect: Rect; spot: Vec2 } | null {
    const L = this.L();
    const cands: { id: number; rect: Rect; spot: Vec2 }[] = [];
    this.windows.forEach((w, i) => {
      if (!this.bigEnough(w.rect)) return;
      const r = w.rect;
      const spot = { x: r.x + 1.5 * L + this.rng.next() * (r.w - 3 * L), y: r.y + 0.25 * L };
      if (!monitorAt(spot, this.monitors)) return;
      if (this.windows.slice(0, i).some((f) => rectContains(f.rect, spot))) return;
      cands.push({ id: w.id, rect: r, spot });
    });
    return cands.length ? cands[Math.floor(this.rng.next() * cands.length)] : null;
  }

  /** 숨을 가장자리(왼·오른·아래). 가장자리 점이 앞 창에 가려지지 않고, 바깥 접근점이 화면 안이어야 한다 */
  private hideTarget(): { id: number; rect: Rect; outside: Vec2; deep: Vec2; peek: Vec2 | null } | null {
    const L = this.L();
    const cands: { id: number; rect: Rect; outside: Vec2; deep: Vec2; peek: Vec2 | null }[] = [];
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
        // 가장자리 점과 접근점 모두 앞 창에 가려지지 않아야 한다 (나란히 붙인 창 사이 포함)
        if (!monitorAt(outside, this.monitors) || front.some((f) => rectContains(f.rect, { x: e.x, y: e.y }) || rectContains(f.rect, outside))) continue;
        // 얼굴 내밀기: 깊이 들어갔다가 돌아 나와 바깥을 본다. 아니면 몸 절반만 들어간다 (사용자 선택: 엉덩이·꼬리가 밖으로)
        const peek = chance(this.rng, 0.3);
        cands.push({ id: w.id, rect: r, outside, deep: peek ? at(-1.3) : at(-0.1), peek: peek ? at(-0.35) : null });
      }
    });
    return cands.length ? cands[Math.floor(this.rng.next() * cands.length)] : null;
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
