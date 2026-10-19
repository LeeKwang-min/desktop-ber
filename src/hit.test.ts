import { describe, it, expect } from 'vitest';
import { buildCat } from './cat/model';
import { BER } from './cat/params';
import { makeCamera, frameCamera, placeRoot } from './camera';
import { hitCat } from './hit';

describe('hitCat', () => {
  // 화면 (500, 400)에 오른쪽을 보고 선 몸길이 130px 베르. 몸통은 바닥보다 약 34px 위라 화면에선 위로 약 20px 올라가 보인다.
  const rig = buildCat(BER);
  const cam = makeCamera();
  placeRoot(rig.root, { x: 500, y: 400 }, 0, 130);
  frameCamera(cam, 300, 200, 400);

  it("hits Ber's body and head", () => {
    expect(hitCat(rig.root, cam, { x: 500, y: 385 })).toBe(true);
    expect(hitCat(rig.root, cam, { x: 552, y: 372 })).toBe(true);
  });
  it('misses empty space around Ber', () => {
    expect(hitCat(rig.root, cam, { x: 500, y: 250 })).toBe(false);
    expect(hitCat(rig.root, cam, { x: 650, y: 400 })).toBe(false);
  });
});
