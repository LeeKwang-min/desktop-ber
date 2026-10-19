// 자세 = 뼈 각도 묶음. 각도는 라디안, height는 모델 단위.
// 관절 규칙: legs.swing>0 발이 앞으로, knee는 아랫다리 굽힘, splay>0 바깥으로 벌림.
// roll>0 몸이 옆으로 눕는 방향, pitch>0 가슴이 들림, neckPitch<0 고개 숙임.
// 누운 자세(lieSide·curl)는 몸이 90° 돌아 있어서 꼬리 lift가 바닥 평면에서 감기는 방향이 된다.
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
    ...stand, pitch: 0.42, height: -0.04, neckPitch: -0.32,
    legs: [leg(-0.42), leg(-0.42), leg(1.35, -2.5), leg(1.35, -2.5)],
    tail: { lift: -0.35, curl: 2.2, sway: 0.06 },
  },
  groom: {
    ...stand, pitch: 0.42, height: -0.04, neckPitch: -0.75, neckYaw: 0.35, eyes: 0.6,
    legs: [leg(0.9, -1.7), leg(-0.42), leg(1.35, -2.5), leg(1.35, -2.5)],
    tail: { lift: -0.35, curl: 2.2, sway: 0.04 },
  },
  loaf: {
    ...stand, height: -BER.legLen * 0.9, neckPitch: -0.12, eyes: 0.5,
    legs: [leg(-1.2, 2.4), leg(-1.2, 2.4), leg(1.2, -2.4), leg(1.2, -2.4)],
    tail: { lift: -0.3, curl: 2.6, sway: 0.03 },
  },
  lieSide: {
    ...stand, height: BER.c - cy, roll: 1.45, neckPitch: 0.1, eyes: 0.8,
    legs: [leg(0.35, 0, 0.25), leg(0.35, 0, 0.1), leg(-0.3, 0, 0.25), leg(-0.3, 0, 0.1)],
    tail: { lift: 0.7, curl: 0, sway: 0.05 },
  },
  curl: {
    ...stand, height: BER.c - cy, roll: 1.45, spineYaw: 1.3, neckYaw: 0.9, neckPitch: -0.2, eyes: 1,
    legs: [leg(0.4, -1.2), leg(0.4, -1.2), leg(0.6, -1.4), leg(0.6, -1.4)],
    tail: { lift: 1.9, curl: 0, sway: 0.02 },
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
