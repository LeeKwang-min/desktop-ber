import { describe, it, expect } from 'vitest';
import { Brain, angleDiff, staleSafe, STALE_SEC, type BrainInput, type CatState, type Settings, type Snapshot } from './brain';
import { mulberry32 } from './rng';
import { dist, rectContains, type MonitorInfo, type Vec2, type WinInfo } from '../world';
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

  it('walks through the empty space between monitors without jumping (review fix)', () => {
    // 노트북 오른쪽에 세로 중앙 정렬된 외장 모니터: 노트북 위쪽 너머(x<1512, y<0)는 빈 공간
    const laptop: MonitorInfo = { id: 'L', rect: { x: 0, y: 0, w: 1512, h: 982 }, cssPerWorld: 1, primary: true };
    const ext: MonitorInfo = { id: 'E', rect: { x: 1512, y: -458, w: 2560, h: 1440 }, cssPerWorld: 1, primary: false };
    const ms = [laptop, ext];
    const b = new Brain(mulberry32(11), settings(), ms);
    b.walkTo({ x: 1000, y: 160 });
    for (let t = 0; t < 30; t += 1 / 30) b.step(input(ms));
    const target = { x: 1700, y: -144 };
    b.walkTo(target);
    let prev = { ...b.state.pos }, maxJump = 0, arrived = false;
    for (let t = 0; t < 30 && !arrived; t += 1 / 30) {
      const s = b.step(input(ms));
      maxJump = Math.max(maxJump, Math.hypot(s.pos.x - prev.x, s.pos.y - prev.y));
      prev = { ...s.pos };
      arrived = Math.hypot(s.pos.x - target.x, s.pos.y - target.y) < 20;
    }
    expect(maxJump).toBeLessThan(5); // 걷기 한 프레임 ≈ 0.6 × 130 / 30 ≈ 2.6px
    expect(arrived).toBe(true);
  });

  it('lets viewers stop walking in place when the brain goes silent (spec §10)', () => {
    const b = new Brain(mulberry32(12), settings(), [main]);
    b.walkTo({ x: b.state.pos.x + 600, y: b.state.pos.y });
    for (let t = 0; t < 1.5; t += 1 / 30) b.step(input([main]));
    const walking = { ...b.state };
    expect(walking.gait).toBe('walk');
    expect(staleSafe(walking, STALE_SEC - 0.5)).toBe(walking);
    const frozen = staleSafe(walking, STALE_SEC + 0.5);
    expect(frozen.gait).toBe('none');
    expect(frozen.speed).toBe(0);
    expect(frozen.pos).toEqual(walking.pos);
  });

  it('reports body length in its state and follows setSize', () => {
    const b = new Brain(mulberry32(10), settings(), [main]);
    expect(b.step(input([main])).bodyLengthCss).toBe(130);
    expect(b.step({ ...input([main]), commands: [{ type: 'setSize', bodyLengthCss: 180 }] }).bodyLengthCss).toBe(180);
  });

  it('applies setActivity commands', () => {
    const b = new Brain(mulberry32(9), settings('calm'), [main]);
    b.step({ ...input([main]), commands: [{ type: 'setActivity', activity: 'active' }] });
    expect(b.settings.activity).toBe('active');
  });
});

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

  it('sniffs only once after a chase ends on a resting cursor (review fix)', () => {
    const b = new Brain(mulberry32(22), settings('active'), [main]);
    const p0 = { ...b.state.pos };
    let t = 0;
    for (; t < 4; t += 1 / 60) step(b, { dt: 1 / 60, cursor: wiggle(p0, t) });
    const still = wiggle(p0, t);
    let episodes = 0, prev = '';
    for (let u = 0; u < 10; u += 1 / 60) {
      const s = step(b, { dt: 1 / 60, cursor: still });
      if (s.behavior === 'sniff' && prev !== 'sniff') episodes++;
      prev = s.behavior;
    }
    expect(episodes).toBe(1);
  });

  it('keeps walking away after being annoyed instead of coming back to the cursor (review fix)', () => {
    const b = new Brain(mulberry32(25), settings(), [main]);
    const cursor = { x: b.state.pos.x + 150, y: b.state.pos.y };
    for (let i = 0; i < 5; i++) {
      step(b, { cursor, clicks: 1 });
      for (let t = 0; t < 0.5; t += 1 / 30) step(b, { cursor });
    }
    const seen = new Set<string>();
    for (let t = 0; t < 8; t += 1 / 30) seen.add(step(b, { cursor }).behavior);
    expect(seen.has('sniff')).toBe(false);
    expect(seen.has('stalk')).toBe(false);
  });

  it('keeps leaving when clicked on the way out, and turns back when shown again (review fix)', () => {
    const b = new Brain(mulberry32(27), settings(), [main]);
    step(b, { commands: [{ type: 'hide' }] });
    for (let t = 0; t < 1; t += 1 / 30) step(b);
    step(b, { clicks: 1 });
    expect(step(b).behavior).toBe('leaving');
    step(b, { commands: [{ type: 'show' }] });
    for (let t = 0; t < 30; t += 1 / 30) step(b);
    expect(b.state.visible).toBe(true);
    expect(inside(b.state.pos, [main])).toBe(true);
  });

  it('ignores a malformed snapshot instead of crashing (review fix)', () => {
    for (const bad of [{}, { pos: { x: NaN, y: 1 }, heading: 0, pose: 'loaf' }, { pos: { x: 100, y: 100 }, heading: 0, pose: 'flying' }]) {
      const b = new Brain(mulberry32(31), settings(), [main], { restore: bad as unknown as Snapshot });
      expect(inside(b.state.pos, [main])).toBe(true);
      expect(b.state.pose).toBe('loaf');
    }
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

describe('Brain and windows', () => {
  const win = (id: number, x: number, y: number, w = 900, h = 600): WinInfo => ({ id, rect: { x, y, w, h } });
  const run = (b: Brain, windows: WinInfo[], seconds: number, until?: (s: CatState) => boolean) => {
    for (let t = 0; t < seconds; t += 1 / 15) {
      const s = b.step({ ...input([main], 1 / 15), windows });
      if (until?.(s)) return s;
    }
    return null;
  };
  // 걷기는 목표 0.1 몸길이(13px) 안이면 도착으로 치므로 같은 허용치로 본다
  const onTitleBar = (s: CatState, w: WinInfo) => s.pos.x > w.rect.x && s.pos.x < w.rect.x + w.rect.w && Math.abs(s.pos.y - (w.rect.y + 0.25 * 130)) < 0.1 * 130 + 1;

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

  it('never naps on or hides under a window it is not actually at, even when windows keep moving (review fix)', () => {
    const spots = [{ x: 100, y: 100 }, { x: 900, y: 400 }, { x: 300, y: 450 }];
    for (const activity of ['calm', 'active'] as const) {
      const b = new Brain(mulberry32(1), settings(activity), [main]);
      let k = 0, w = win(42, spots[0].x, spots[0].y, 700, 450);
      for (let i = 1; i < 3 * 3600 * 15; i++) {
        let moved: { dx: number; dy: number; old: WinInfo } | null = null;
        if (i % (15 * 15) === 0) {
          const old = w;
          k = (k + 1) % spots.length;
          w = win(42, spots[k].x, spots[k].y, 700, 450);
          moved = { dx: w.rect.x - old.rect.x, dy: w.rect.y - old.rect.y, old };
        }
        const before = { ...b.state.pos };
        const s = b.step({ ...input([main], 1 / 15), windows: [w] });
        if (moved && Math.abs(s.pos.x - before.x - moved.dx) < 0.01 && Math.abs(s.pos.y - before.y - moved.dy) < 0.01) {
          // 창을 따라 끌려갔다면 원래 그 창의 제목 표시줄 위에 있었어야 한다
          if (!onTitleBar({ ...s, pos: before }, moved.old)) throw new Error(`${activity}: dragged by a window it was not on (step ${i})`);
        }
        if (s.layer.kind === 'under') {
          const r = w.rect, L = 130;
          const near = s.pos.x > r.x - 1.5 * L && s.pos.x < r.x + r.w + 1.5 * L && s.pos.y > r.y - 1.5 * L && s.pos.y < r.y + r.h + 1.5 * L;
          if (!near) throw new Error(`${activity}: hiding under a window it is not at (step ${i})`);
        }
      }
    }
  }, 120000);

  it('hides only about half its body under the window (user choice)', () => {
    const w = win(7, 300, 200);
    const depths: number[] = [];
    for (let seed = 1; seed <= 40 && depths.length < 6; seed++) {
      const b = new Brain(mulberry32(seed), settings('active'), [main]);
      const s = run(b, [w], 3 * 3600, (st) => st.layer.kind === 'under' && st.behavior === 'hide' && st.gait === 'none' && st.pose === 'loaf');
      if (!s) continue;
      const r = w.rect;
      depths.push(Math.min(s.pos.x - r.x, r.x + r.w - s.pos.x, r.y + r.h - s.pos.y)); // 가장 가까운 가장자리에서 안쪽으로
    }
    expect(depths.length).toBeGreaterThan(2);
    for (const d of depths) expect(d).toBeLessThan(0.5 * 130);
  }, 120000);

  it('never naps on or hides under windows when none are known (Review Focus 3)', () => {
    const b = new Brain(mulberry32(4), settings('active'), [main]);
    for (let i = 0; i < 2 * 3600 * 15; i++) {
      const s = b.step(input([main], 1 / 15));
      if (s.layer.kind !== 'top') throw new Error('went under a window that does not exist');
    }
  }, 30000);
});
