import { describe, it, expect } from 'vitest';
import { POSES, lerpPose } from './poses';
import { POSE_NAMES } from './graph';

describe('poses', () => {
  it('defines every pose with four legs and finite numbers', () => {
    for (const n of POSE_NAMES) {
      const p = POSES[n];
      expect(p.legs).toHaveLength(4);
      const nums = [p.height, p.roll, p.pitch, p.spineYaw, p.spinePitch, p.neckPitch, p.neckYaw, p.eyes, p.tail.lift, p.tail.curl, p.tail.sway, ...p.legs.flatMap((l) => [l.swing, l.knee, l.splay])];
      for (const v of nums) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('lerps endpoints exactly and midpoints linearly', () => {
    const a = POSES.stand, b = POSES.bellyUp;
    expect(lerpPose(a, b, 0)).toEqual(a);
    expect(lerpPose(a, b, 1)).toEqual(b);
    const m = lerpPose(a, b, 0.5);
    expect(m.roll).toBeCloseTo((a.roll + b.roll) / 2);
    expect(m.legs[3].splay).toBeCloseTo((a.legs[3].splay + b.legs[3].splay) / 2);
  });
  it('closes eyes when sleeping curled', () => {
    expect(POSES.curl.eyes).toBe(1);
    expect(POSES.stand.eyes).toBe(0);
  });
});
