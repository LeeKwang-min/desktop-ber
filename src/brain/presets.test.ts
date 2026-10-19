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
