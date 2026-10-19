import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { buildCat } from './model';
import { BER } from './params';
import { Animator } from './animator';
import { NO_OVERLAYS } from '../state';

describe('Animator', () => {
  it('lies down and gets up smoothly whichever way Ber faces (review fix)', () => {
    for (const heading of [0, Math.PI]) { // 오른쪽을 볼 때(0)는 배가 화면을 향하도록 반대로 눕는다
      const rig = buildCat(BER);
      const anim = new Animator(rig, 'loaf');
      const input = { gait: 'none' as const, speed: 0, heading, overlays: NO_OVERLAYS, lookYaw: null };
      anim.update(1 / 60, input);
      let prev = rig.body.rotation.x, maxStep = 0;
      for (const target of ['lieSide', 'loaf'] as const) {
        anim.setTarget(target);
        for (let i = 0; i < 90; i++) {
          anim.update(1 / 60, input);
          maxStep = Math.max(maxStep, Math.abs(rig.body.rotation.x - prev));
          prev = rig.body.rotation.x;
        }
      }
      expect(maxStep, `heading ${heading}`).toBeLessThan(0.1);
      rig.dispose();
    }
  });
  it("turns the head toward lookYaw (positive = toward Ber's right, model +Z)", () => {
    const rig = buildCat(BER);
    const anim = new Animator(rig, 'stand');
    const headZ = (lookYaw: number) => {
      for (let i = 0; i < 5; i++) anim.update(1 / 60, { gait: 'none', speed: 0, heading: 0, overlays: NO_OVERLAYS, lookYaw });
      rig.root.updateMatrixWorld(true);
      return rig.head.getWorldPosition(new THREE.Vector3()).z;
    };
    expect(headZ(0.8)).toBeGreaterThan(0.02);
    expect(headZ(-0.8)).toBeLessThan(-0.02);
    rig.dispose();
  });
});
