import { describe, it, expect } from 'vitest';
import { worldToLocal, localToWorld, monitorAt, clampToMonitors, inset, rectsIntersect, bodyLenWorld, rectToLocal, type MonitorInfo } from './world';

const main: MonitorInfo = { id: '1', rect: { x: 0, y: 0, w: 1920, h: 1080 }, cssPerWorld: 1, primary: true };
const left: MonitorInfo = { id: '2', rect: { x: -1920, y: 0, w: 1920, h: 1080 }, cssPerWorld: 1, primary: false };
const above: MonitorInfo = { id: '3', rect: { x: 0, y: -1440, w: 2560, h: 1440 }, cssPerWorld: 1, primary: false };
const win150: MonitorInfo = { id: '4', rect: { x: 2560, y: 0, w: 3840, h: 2160 }, cssPerWorld: 1 / 1.5, primary: false };

describe('world', () => {
  it('converts world to local css px for negative-origin monitors', () => {
    expect(worldToLocal({ x: -1000, y: 50 }, left)).toEqual({ x: 920, y: 50 });
    expect(worldToLocal({ x: 10, y: -1400 }, above)).toEqual({ x: 10, y: 40 });
  });

  it('applies cssPerWorld for scaled monitors and round-trips', () => {
    const l = worldToLocal({ x: 2560 + 300, y: 150 }, win150);
    expect(l.x).toBeCloseTo(200);
    expect(l.y).toBeCloseTo(100);
    const w = localToWorld(l, win150);
    expect(w.x).toBeCloseTo(2860);
    expect(w.y).toBeCloseTo(150);
  });

  it('finds the monitor under a point, including negative coordinates', () => {
    const ms = [main, left, above];
    expect(monitorAt({ x: -5, y: 10 }, ms)?.id).toBe('2');
    expect(monitorAt({ x: 100, y: -5 }, ms)?.id).toBe('3');
    expect(monitorAt({ x: 5000, y: 10 }, ms)).toBeNull();
  });

  it('clamps points into the nearest monitor, inset by margin', () => {
    expect(clampToMonitors({ x: 2000, y: 500 }, [main, left], 100)).toEqual({ x: 1820, y: 500 });
    expect(clampToMonitors({ x: -3000, y: -50 }, [main, left], 100)).toEqual({ x: -1820, y: 100 });
    expect(clampToMonitors({ x: 500, y: 500 }, [main], 100)).toEqual({ x: 500, y: 500 });
    expect(clampToMonitors({ x: 5, y: 5 }, [], 100)).toEqual({ x: 5, y: 5 });
  });

  it('insets without inverting tiny rects', () => {
    expect(inset({ x: 0, y: 0, w: 100, h: 40 }, 30)).toEqual({ x: 30, y: 20, w: 40, h: 0 });
  });

  it('detects rect intersection', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it('converts a world rect to local css px', () => {
    const r = rectToLocal({ x: 2560 + 300, y: 150, w: 600, h: 300 }, win150);
    expect(r.x).toBeCloseTo(200);
    expect(r.y).toBeCloseTo(100);
    expect(r.w).toBeCloseTo(400);
    expect(r.h).toBeCloseTo(200);
  });

  it('converts body length from css px to world units', () => {
    expect(bodyLenWorld(130, main)).toBe(130);
    expect(bodyLenWorld(130, win150)).toBeCloseTo(195);
    expect(bodyLenWorld(130, null)).toBe(130);
  });
});
