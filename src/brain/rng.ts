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
