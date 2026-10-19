// 사용자 선택: 냄새 맡을 때 코끝이 커서 바로 앞까지만 온다 (커서를 덮으면 다음 클릭이 앱 대신 베르에게 간다)
import { describe, it, expect } from 'vitest';
import { Brain } from './brain/brain';
import { mulberry32 } from './brain/rng';
import { buildCat } from './cat/model';
import { BER } from './cat/params';
import { makeCamera, frameCamera, placeRoot } from './camera';
import { hitCat } from './hit';
import { dist, type MonitorInfo, type Vec2 } from './world';

const main: MonitorInfo = { id: '1', rect: { x: 0, y: 0, w: 1920, h: 1080 }, cssPerWorld: 1, primary: true };

describe('sniffing distance (review fix)', () => {
  it('stops with the nose just before a resting cursor, never covering it, from any direction', () => {
    const rig = buildCat(BER);
    const cam = makeCamera();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const b = new Brain(mulberry32(100 + k), { activity: 'calm', bodyLengthCss: 130 }, [main]);
      const p0 = { ...b.state.pos };
      const cursor = { x: p0.x + Math.cos(a) * 320, y: p0.y + Math.sin(a) * 320 };
      let at: { pos: Vec2; heading: number } | null = null;
      for (let t = 0; t < 12 && !at; t += 1 / 30) {
        const s = b.step({ dt: 1 / 30, cursor, windows: [], monitors: [main], clicks: 0, commands: [] });
        if (s.behavior === 'sniff' && s.gait === 'none' && s.lookAt) at = { pos: { ...s.pos }, heading: s.heading };
      }
      expect(at, `direction ${k}: never sniffed`).not.toBeNull();
      placeRoot(rig.root, at!.pos, at!.heading, 130);
      frameCamera(cam, at!.pos.x - 300, at!.pos.y - 300, 600);
      expect(hitCat(rig.root, cam, cursor), `direction ${k}: Ber covers the cursor`).toBe(false);
      expect(dist(cursor, at!.pos), `direction ${k}: stopped too far`).toBeLessThan(130 * 1.2);
    }
    rig.dispose();
  });
});
