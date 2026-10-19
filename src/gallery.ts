// 개발용 자세 갤러리: http://localhost:1420/?gallery (Tauri 없이 일반 브라우저에서)
// 1행: 8개 자세 고정 / 2행: 걷기·뛰기·전환 순환·회전하며 걷기
import { CatView } from './render';
import { BER } from './cat/params';
import { Animator } from './cat/animator';
import { NO_OVERLAYS, type Gait } from './state';
import { POSE_NAMES, type PoseName } from './cat/graph';

interface Cell { view: CatView; anim: Animator; label: HTMLDivElement; gait: Gait; cycle: boolean; spin: boolean; heading: number }

export function runGallery() {
  const q = new URLSearchParams(location.search);
  const focus = q.get('focus') as PoseName | null;
  if (focus) return runFocus(focus, Number(q.get('tilt') ?? 38), Number(q.get('heading') ?? Math.PI / 2 - 0.35), (q.get('gait') ?? 'none') as Gait);
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
    Object.assign(box.style, { position: 'relative', width: '320px', height: '240px', background: 'rgba(255,255,255,.25)', borderRadius: '8px', overflow: 'hidden' });
    const canvas = document.createElement('canvas');
    const label = document.createElement('div');
    Object.assign(label.style, { position: 'absolute', left: '8px', top: '6px', fontSize: '13px', color: '#333' });
    label.textContent = title;
    box.append(canvas, label);
    grid.appendChild(box);
    const view = new CatView(canvas, BER, (Number(q.get('tilt') ?? 38) * Math.PI) / 180);
    view.resize(320, 240);
    if (q.get('occlude')) view.setOccluders([{ x: 160, y: 0, w: 160, h: 240 }]); // 오른쪽 절반을 창이 가린 것처럼
    const anim = new Animator(view.rig, start);
    cells.push({ view, anim, label, gait, cycle, spin, heading: Number(q.get('heading') ?? Math.PI / 2 - 0.35) });
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
      c.view.place({ x: 160, y: 150 }, c.heading, 120);
      c.view.render();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** 한 자세를 크게: ?gallery&focus=sit&tilt=85&heading=0&gait=walk (tilt 85 ≈ 옆모습) */
function runFocus(pose: PoseName, tiltDeg: number, heading: number, gait: Gait) {
  document.body.innerHTML = '<canvas id="f" style="width:100vw;height:100vh;display:block"></canvas>';
  document.body.style.background = 'linear-gradient(135deg,#eef2f7,#cdd8e6)';
  const canvas = document.getElementById('f') as HTMLCanvasElement;
  const view = new CatView(canvas, BER, (tiltDeg * Math.PI) / 180);
  const anim = new Animator(view.rig, pose);
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    view.resize(innerWidth, innerHeight);
    anim.update(dt, { gait, speed: gait === 'run' ? 3 : 0.6, heading, overlays: NO_OVERLAYS, lookYaw: null });
    view.place({ x: innerWidth / 2, y: innerHeight * 0.62 }, heading, Math.min(innerWidth, innerHeight) * 0.6);
    view.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
