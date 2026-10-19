// 오버레이 웹뷰: 주 모니터면 두뇌를 돌려 상태를 방송하고, 모든 웹뷰는 자기 모니터에 베르가 있으면 그린다.
// 커서가 베르 위에 있을 때만 이 창이 클릭을 받는다(나머지는 아래 앱으로 통과).
import { bridge, type TrayCommand } from './bridge';
import { CatView } from './render';
import { BER } from './cat/params';
import { Animator } from './cat/animator';
import { Brain, angleDiff, staleSafe, type CatState, type Command, type Snapshot } from './brain/brain';
import { mulberry32 } from './brain/rng';
import { SIZE_CSS } from './brain/presets';
import { rectContains, rectToLocal, worldToLocal, type MonitorInfo, type Vec2, type WinInfo } from './world';

// 쉬는 중 렌더 주기: 자는 동안은 숨쉬기 정도만 움직이므로 더 느리게 (릴리스 빌드 측정으로 정함)
const REST_FPS = 12, SLEEP_FPS = 6;
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
    // 모니터 구성이 바뀌는 중이거나 화면이 막 꺼진 순간에 뜬 창: 두뇌가 둘 생기지 않게 아무것도 하지 않고,
    // 같은 구성으로 돌아와 창이 다시 만들어지지 않는 경우를 대비해 잠시 뒤 다시 시도한다
    bridge.log(`overlay: monitor ${bridge.monitorId} not in [${monitors.map((m) => m.id).join(',')}], retrying`);
    setTimeout(() => location.reload(), 2000);
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
  let windows: WinInfo[] = [];
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
  await bridge.onWindows((w) => { windows = w; });
  await bridge.onCursor((p) => { cursor = p; updateClickThrough(); });
  canvas.addEventListener('pointerdown', () => { void bridge.sendClick(); });

  // 움직일 때는 rAF(디스플레이 주기), 쉴 때는 REST_FPS 타이머로 돈다.
  // 쉬는 중에도 rAF를 계속 돌리면 렌더를 건너뛰어도 WebKit·WindowServer가 매 프레임 일한다(측정으로 확인).
  let last = performance.now(), lastSent = '', lastSentAt = 0, lastSnapshot = 0, lastHitCheck = 0;
  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1); // 잠자기·깨우기 후 거대한 dt는 1초로 자르고, 두뇌가 다시 잘게 나눈다
    last = now;
    if (brain) {
      state = brain.step({ dt, cursor, windows, monitors, clicks, commands: commands.splice(0) });
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
      // 숨은 창과 그 앞의 창들이 베르를 가린다 (Review Focus 5)
      const layer = state.layer;
      const idx = layer.kind === 'under' ? windows.findIndex((w) => w.id === layer.windowId) : -1;
      view.setOccluders(idx >= 0 ? windows.slice(0, idx + 1).map((w) => rectToLocal(w.rect, me)) : []);
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
      // 멈춘 커서 밑으로 베르가 오가도 클릭 통과를 다시 판정한다 (최대 15Hz — 히트 판정이 호출당 ~1ms)
      if (now - lastHitCheck > 66) { lastHitCheck = now; updateClickThrough(); }
    }
    if (busy) requestAnimationFrame(tick);
    else setTimeout(tick, 1000 / (state?.behavior === 'sleep' ? SLEEP_FPS : REST_FPS));
  };
  tick();
}
