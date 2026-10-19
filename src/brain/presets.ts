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
