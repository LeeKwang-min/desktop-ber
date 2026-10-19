// 목표 자세로 그래프 경로를 따라 보간하고, 그 위에 보행·숨쉬기·덧씌우는 동작을 얹어 뼈대에 적용한다.
import * as THREE from 'three';
import { SPINE_BONES, type CatRig } from './model';
import type { CatParams } from './params';
import { posePath, TRANSITION_SEC, type PoseName } from './graph';
import { POSES, lerpPose, type Pose } from './poses';
import type { Gait, Overlays } from '../state';

export interface AnimInput { gait: Gait; speed: number; heading: number; overlays: Overlays; lookYaw: number | null }

const ease = (t: number) => t * t * (3 - 2 * t);
const X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
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

  /** 꼬리 점이 바닥(y=0) 아래로 들어가면 바닥 위로 올린다. 누운 자세에서 꼬리가 바닥에 늘어지는 모습이 된다. */
  private groundedTail(pts: THREE.Vector3[]): THREE.Vector3[] {
    const R = this.rig;
    R.root.updateMatrixWorld(true);
    const floor = R.params.tailR * R.root.scale.y + R.root.position.y;
    return pts.map((p) => {
      const w = R.tailBase.localToWorld(p.clone());
      if (w.y < floor) w.y = floor;
      return R.tailBase.worldToLocal(w);
    });
  }
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
    // 눕는 방향: 배(흰 발)가 화면 쪽(카메라가 있는 +Z)을 향하도록, 오른쪽을 보고 있으면 반대로 굴린다.
    // 보간 중인 현재 값이 아니라 전환의 양 끝 자세로 판단해야 눕는 도중에 방향이 홱 바뀌지 않는다.
    // 절차적 동작(걷는 중 회전 휨 등)을 얹기 전의 기본 자세 값에만 적용한다.
    const target = POSES[this.queue[0] ?? this.at];
    if (Math.max(Math.abs(this.from.roll), Math.abs(target.roll)) > 0.3 && Math.cos(inp.heading) >= 0) {
      roll = -roll; spineYaw = -spineYaw; neckYaw = -neckYaw;
    }
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
    // 시선: lookYaw > 0 이면 베르의 오른쪽(모델 +Z)으로. 목 회전 +y는 +X를 -Z 쪽으로 돌리므로 부호를 뒤집는다.
    if (inp.lookYaw !== null) neckYaw -= clamp(inp.lookYaw, -0.9, 0.9) * 0.8;
    else if (!moving && eyes < 0.5) neckYaw += Math.sin(this.time * 0.37) * 0.12; // 두리번
    if (settled && this.at === 'groom') {                                    // 핥기 반복
      neckPitch += Math.sin(this.time * 7) * 0.12;
      legs[0].swing += Math.sin(this.time * 7) * 0.12;
    }
    if (settled && this.at === 'crouch') rumpYaw = Math.sin(this.time * 11) * 0.18; // 엉덩이 씰룩
    if (inp.overlays.purr) { eyes = Math.max(eyes, 0.95); roll += Math.sin(this.time * 55) * 0.006; }
    if (inp.overlays.tailThump) tail.lift += Math.sin(this.time * 16) * 0.35;


    const R = this.rig;
    // 롤은 몸통 축(높이 cy) 기준, 피치는 뒷다리 아래 바닥점 기준으로 돈다: pos = Rp·(cR − Rr·cR − cP) + cP
    const P = R.params;
    const cR = new THREE.Vector3(0, P.legLen + P.b * 0.55, 0), cP = new THREE.Vector3(-P.a * 0.65, 0, 0);
    const off = cR.clone().sub(cR.clone().applyAxisAngle(X_AXIS, roll)).sub(cP).applyAxisAngle(Z_AXIS, pitch).add(cP);
    R.body.rotation.order = 'ZXY';
    R.body.rotation.set(roll, 0, pitch);
    R.body.position.set(off.x, off.y + height, off.z);
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
    R.setTail(this.groundedTail(tailPoints(R.params, tail, this.time)));
  }
}
