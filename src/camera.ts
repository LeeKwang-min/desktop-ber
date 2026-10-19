// 카메라·배치 수학. three.js만 쓰고 WebGL이 필요 없어서 테스트할 수 있다.
import * as THREE from 'three';
import type { Vec2 } from './world';
import { MODEL_BODY_LENGTH } from './cat/params';

export const TILT = (38 * Math.PI) / 180;
const CAM_DIST = 5000;

/** 수직에서 tilt만큼 기울여 +Z 쪽에서 내려다보는 직교 카메라. 바닥점 (x, 0, y / cos tilt)가 화면 CSS (x, y)에 온다. */
export function makeCamera(tilt = TILT): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, 1, CAM_DIST * 2);
  cam.up.set(0, Math.sin(tilt), -Math.cos(tilt));
  cam.position.set(0, CAM_DIST * Math.cos(tilt), CAM_DIST * Math.sin(tilt));
  cam.lookAt(0, 0, 0);
  return cam;
}

/** 카메라가 화면 CSS 영역 (x0, y0)~(x0+size, y0+size)만 보게 한다. 뷰 공간 y = -화면 y. */
export function frameCamera(cam: THREE.OrthographicCamera, x0: number, y0: number, size: number) {
  Object.assign(cam, { left: x0, right: x0 + size, top: -y0, bottom: -(y0 + size) });
  cam.updateProjectionMatrix();
}

/** 고양이 루트를 화면 CSS 위치·진행 방향·몸 길이에 맞게 놓고 바닥 기준 yaw를 돌려준다 */
export function placeRoot(root: THREE.Object3D, posCss: Vec2, heading: number, bodyLengthCss: number, tilt = TILT): number {
  const cosT = Math.cos(tilt);
  const yaw = Math.atan2(Math.sin(heading) / cosT, Math.cos(heading));
  root.position.set(posCss.x, 0, posCss.y / cosT);
  root.rotation.y = -yaw;
  root.scale.setScalar(bodyLengthCss / MODEL_BODY_LENGTH);
  return yaw;
}
