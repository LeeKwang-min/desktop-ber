import { describe, it, expect } from 'vitest';
import { mulberry32, pickWeighted, range } from './rng';

describe('rng', () => {
  it('is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('picks by weight proportionally', () => {
    const r = mulberry32(7), counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20000; i++) counts[pickWeighted(r, { a: 1, b: 3, c: 0 })]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.7);
    expect(counts.b / counts.a).toBeLessThan(3.3);
  });
  it('ranges within bounds', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) { const v = range(r, 5, 9); expect(v).toBeGreaterThanOrEqual(5); expect(v).toBeLessThan(9); }
  });
});
