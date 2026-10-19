import { describe, it, expect } from 'vitest';
import { posePath, transitionTime, TRANSITION_SEC, POSE_NAMES } from './graph';

describe('pose graph', () => {
  it('returns a single node when already there', () => {
    expect(posePath('loaf', 'loaf')).toEqual(['loaf']);
    expect(transitionTime('loaf', 'loaf')).toBe(0);
  });
  it('routes stand to bellyUp through loaf and lieSide', () => {
    expect(posePath('stand', 'bellyUp')).toEqual(['stand', 'loaf', 'lieSide', 'bellyUp']);
  });
  it('routes groom to curl through the shortest path', () => {
    expect(posePath('groom', 'curl')).toEqual(['groom', 'sit', 'stand', 'loaf', 'lieSide', 'curl']);
  });
  it('connects every pose to every other pose', () => {
    for (const a of POSE_NAMES) for (const b of POSE_NAMES) {
      const p = posePath(a, b);
      expect(p[0]).toBe(a);
      expect(p[p.length - 1]).toBe(b);
    }
  });
  it('charges TRANSITION_SEC per edge', () => {
    expect(transitionTime('stand', 'curl')).toBeCloseTo(3 * TRANSITION_SEC);
  });
});
