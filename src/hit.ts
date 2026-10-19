// 화면 CSS 점이 베르 몸 위인지: 카메라에서 광선을 쏴 메시와 만나는지 본다 (수염 같은 선은 제외).
import * as THREE from 'three';
import type { Vec2 } from './world';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const OFFSETS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

/** marginCss만큼 넓혀서 판정한다 (가는 꼬리·다리도 누르기 쉽게) */
export function hitCat(root: THREE.Object3D, cam: THREE.OrthographicCamera, pCss: Vec2, marginCss = 8): boolean {
  root.updateMatrixWorld(true);
  cam.updateMatrixWorld();
  // 스키닝된 몸통은 렌더 때만 뼈 행렬이 갱신되므로 직접 갱신한다
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
  for (const [dx, dy] of OFFSETS) {
    const vx = pCss.x + dx * marginCss, vy = -(pCss.y + dy * marginCss);
    ndc.set(((vx - cam.left) / (cam.right - cam.left)) * 2 - 1, ((vy - cam.bottom) / (cam.top - cam.bottom)) * 2 - 1);
    ray.setFromCamera(ndc, cam);
    if (ray.intersectObject(root, true).some((h) => (h.object as THREE.Mesh).isMesh)) return true;
  }
  return false;
}
