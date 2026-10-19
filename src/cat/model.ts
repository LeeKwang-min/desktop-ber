// 베르를 코드로 만든다: 스키닝된 몸통(척추 뼈 5개) + 강체 부위(머리·다리·꼬리)를 뼈에 붙인다.
// 모델 좌표: +X 앞, +Y 위, Z 좌우. 바닥 y=0.
import * as THREE from 'three';
import type { CatParams } from './params';

export const SPINE_BONES = 5;

export interface Leg { hip: THREE.Group; knee: THREE.Group; front: boolean; side: 1 | -1 }

export interface CatRig {
  params: CatParams;
  root: THREE.Group;   // 바닥 위치·방향·크기
  body: THREE.Group;   // 높이·롤·피치
  bones: THREE.Bone[]; // 0 엉덩이 … 4 가슴
  neck: THREE.Group;
  head: THREE.Group;
  ears: THREE.Group[];
  eyes: THREE.Group[];
  legs: Leg[];         // 0 앞왼, 1 앞오, 2 뒤왼, 3 뒤오
  tailBase: THREE.Group;
  setEyes(closed: number): void;          // 0 뜸 ~ 1 감음
  setTail(points: THREE.Vector3[]): void; // tailBase 로컬 좌표
  dispose(): void;
}

const SPHERE = new THREE.SphereGeometry(1, 32, 20);
type V3 = [number, number, number];

function gradientMap(levels: number[]): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** 테두리 광: 면이 시선과 수직일수록 밝힌다. 직교 카메라라 시선 = view-space +Z */
function withRim<T extends THREE.Material>(mat: T, p: CatParams): T {
  const [r, g, b] = p.rim.color.map((v) => v.toFixed(3));
  const strength = p.rim.strength.toFixed(3), power = p.rim.power.toFixed(2);
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      `float berRim = 1.0 - clamp(normalize(normal).z, 0.0, 1.0);
       gl_FragColor.rgb += vec3(${r}, ${g}, ${b}) * pow(berRim, ${power}) * ${strength};
       #include <tonemapping_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => `ber-rim-${r}-${g}-${b}-${strength}-${power}`;
  return mat;
}

/** 척추를 따라 단면 링을 이은 몸통. 각 정점은 x 위치에 따라 인접한 두 뼈에 선형 가중치로 묶인다. */
function torsoGeometry(p: CatParams, A: number, ox: number, cy: number, boneX: number[]): THREE.BufferGeometry {
  const N = 32, M = 28;
  const pos: number[] = [], skinIndex: number[] = [], skinWeight: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, sp = Math.sqrt(Math.max(Math.sin(Math.PI * t), 0));
    const w = p.c * sp * (p.rump + (0.9 - p.rump) * t);
    const h = p.b * sp * (1 - 0.06 * t);
    const yc = cy - p.b * 0.05 * Math.sin(Math.PI * t);
    const x = ox - A + 2 * A * t;
    let k = 0;
    while (k < boneX.length - 2 && x > boneX[k + 1]) k++;
    const f = Math.min(1, Math.max(0, (x - boneX[k]) / (boneX[k + 1] - boneX[k])));
    for (let j = 0; j <= M; j++) {
      const ph = (j / M) * Math.PI * 2;
      pos.push(x, yc + Math.sin(ph) * h, Math.cos(ph) * w);
      skinIndex.push(k, k + 1, 0, 0);
      skinWeight.push(1 - f, f, 0, 0);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const k = i * (M + 1) + j, k2 = k + M + 1;
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCat(p: CatParams): CatRig {
  const C = p.colors;
  const grad = gradientMap(p.toonLevels);
  const fur = withRim(new THREE.MeshToonMaterial({ color: C.fur, gradientMap: grad }), p);
  const white = new THREE.MeshToonMaterial({ color: C.white, gradientMap: grad });
  const nose = new THREE.MeshToonMaterial({ color: C.nose, gradientMap: grad });
  const iris = new THREE.MeshBasicMaterial({ color: C.iris });
  const pupil = new THREE.MeshBasicMaterial({ color: C.pupil });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const disposables: { dispose(): void }[] = [grad, fur, white, nose, iris, pupil, shine];

  const E = (parent: THREE.Object3D, mat: THREE.Material, pos: V3, semi: V3) => {
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.set(...pos); m.scale.set(...semi); parent.add(m);
    return m;
  };
  const capsule = (parent: THREE.Object3D, mat: THREE.Material, r: number, len: number, y: number) => {
    const geo = new THREE.CapsuleGeometry(r, Math.max(len, 0.001), 6, 12);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y; parent.add(m);
    return m;
  };

  const { a, b, c, headR: hr } = p;
  const [sx, sy, sz] = p.headScale;
  const cy = p.legLen + b * 0.55;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 척추 뼈: 몸통 길이를 따라 균등 배치 (휴식 자세는 회전 없음)
  const A = a * 1.05, ox = -a * 0.05;
  const boneX = Array.from({ length: SPINE_BONES }, (_, i) => ox - A + (2 * A * i) / (SPINE_BONES - 1));
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < SPINE_BONES; i++) {
    const bone = new THREE.Bone();
    if (i === 0) { bone.position.set(boneX[0], cy, 0); body.add(bone); }
    else { bone.position.set(boneX[i] - boneX[i - 1], 0, 0); bones[i - 1].add(bone); }
    bones.push(bone);
  }
  const torsoGeo = torsoGeometry(p, A, ox, cy, boneX);
  disposables.push(torsoGeo);
  const torso = new THREE.SkinnedMesh(torsoGeo, fur);
  torso.frustumCulled = false;
  body.add(torso);
  root.updateMatrixWorld(true);
  torso.bind(new THREE.Skeleton(bones));

  /** 몸통 좌표(x, y, z)를 i번 뼈의 로컬 좌표로 */
  const at = (i: number, x: number, y: number, z = 0): V3 => [x - boneX[i], y - cy, z];

  // 흰 턱받이
  E(bones[4], white, at(4, a * 0.84, cy - b * 0.12), [a * 0.2, b * 0.5, c * 0.42]);

  // 목 → 머리
  const neckPos: V3 = [a * 0.72, cy + b * 0.3, 0];
  const neck = new THREE.Group();
  neck.position.set(...at(4, neckPos[0], neckPos[1]));
  bones[4].add(neck);
  const head = new THREE.Group();
  head.position.set(a * p.hx + hr * 0.3 - neckPos[0], cy + b * p.hy - neckPos[1], 0);
  neck.add(head);
  E(head, fur, [0, 0, 0], [hr * sx, hr * sy, hr * sz]);
  for (const z of [-1, 1]) E(head, fur, [hr * 0.12, -hr * 0.3, z * hr * 0.6 * sz], [hr * 0.5 * p.cheek, hr * 0.42 * p.cheek, hr * 0.48 * p.cheek]);
  E(head, fur, [hr * 0.72 * sx, -hr * 0.3, 0], [hr * 0.24, hr * 0.2, hr * 0.36]);   // 주둥이
  E(head, white, [hr * 0.8 * sx, -hr * 0.43, 0], [hr * 0.2, hr * 0.13, hr * 0.27]); // 흰 턱
  for (const z of [-1, 1]) E(head, white, [hr * 0.86 * sx, -hr * 0.31, z * hr * 0.13 * p.pad], [hr * 0.13 * p.pad, hr * 0.11 * p.pad, hr * 0.14 * p.pad]); // 흰 콧수염 패드
  E(head, nose, [hr * 0.98 * sx, -hr * 0.2, 0], [hr * 0.06, hr * 0.045, hr * 0.075]);

  // 눈: 머리 타원체 표면에 붙이고 표면 법선을 바라보게
  const eyes: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const d = new THREE.Vector3(0.9, p.eye.height, p.eye.spread * z).normalize();
    const pos = new THREE.Vector3(d.x * hr * sx, d.y * hr * sy, d.z * hr * sz).multiplyScalar(0.97);
    const n = new THREE.Vector3(pos.x / (sx * sx), pos.y / (sy * sy), pos.z / (sz * sz)).normalize();
    const eg = new THREE.Group();
    eg.position.copy(pos);
    eg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    head.add(eg);
    const er = hr * p.eye.r;
    E(eg, iris, [0, 0, 0], [er, er * 1.05, er * 0.4]);
    E(eg, pupil, [0, 0, er * 0.2], [er * 0.45, er * 0.82, er * 0.3]);
    E(eg, shine, [er * 0.32 * (z > 0 ? -1 : 1), er * 0.4, er * 0.42], [er * 0.22, er * 0.22, er * 0.14]);
    eyes.push(eg);
  }

  // 귀
  const ears: THREE.Group[] = [];
  const earGeo = new THREE.ConeGeometry(p.ear.r, p.ear.h, 24);
  disposables.push(earGeo);
  for (const z of [-1, 1]) {
    const eg = new THREE.Group();
    eg.position.set(-hr * 0.08, hr * 0.5 * sy, z * hr * 0.62 * sz);
    eg.rotation.set(z * p.ear.tilt, 0, 0.2);
    head.add(eg);
    const m = new THREE.Mesh(earGeo, fur);
    m.position.y = p.ear.h * 0.3; m.scale.set(0.45, 1, 1);
    eg.add(m);
    ears.push(eg);
  }

  // 수염
  const wpts: THREE.Vector3[] = [], W = hr * p.whisker;
  for (const z of [-1, 1]) for (let k = 0; k < 3; k++) {
    const s0 = new THREE.Vector3(hr * 0.88 * sx, -hr * 0.3, z * hr * 0.2 * p.pad);
    wpts.push(s0, new THREE.Vector3(s0.x + (k - 1) * hr * 0.2 + hr * 0.08, s0.y + (k - 1) * hr * 0.1 - hr * 0.04, z * (hr * 0.2 * p.pad + W)));
  }
  const wGeo = new THREE.BufferGeometry().setFromPoints(wpts);
  const wMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  disposables.push(wGeo, wMat);
  head.add(new THREE.LineSegments(wGeo, wMat));

  // 다리: 엉덩이/어깨 → 윗다리 → 무릎 → 아랫다리 + 발. 앞발은 발끝만 흰색, 뒷발은 흰 양말.
  const hipY = cy - b * 0.35, L = hipY, L1 = L * 0.5, L2 = L - L1, r = p.legR;
  const legs: Leg[] = [];
  const defs: [number, 1 | -1, boolean, number][] = [[a * 0.6, 1, true, 3], [a * 0.6, -1, true, 3], [-a * 0.6, 1, false, 1], [-a * 0.6, -1, false, 1]];
  for (const [x, side, front, bi] of defs) {
    const hip = new THREE.Group();
    hip.position.set(...at(bi, x, hipY, side * c * 0.55));
    bones[bi].add(hip);
    capsule(hip, fur, r, L1, -L1 / 2);
    const knee = new THREE.Group();
    knee.position.y = -L1;
    hip.add(knee);
    capsule(knee, fur, r * 0.95, L2 - r, -(L2 - r) / 2);
    E(knee, fur, [r * 0.3, -L2 + r * 0.9, 0], [r * 1.3, r * 0.8, r * 1.1]);
    if (front) {
      E(knee, white, [r * 1.0, -L2 + r * 0.75, 0], [r * 0.75, r * 0.6, r * 0.95]);
    } else {
      const sock = L * 0.42;
      capsule(knee, white, r, Math.max(sock - 2 * r, 0.001), -L2 + sock / 2);
      E(knee, white, [r * 0.3, -L2 + r * 0.9, 0], [r * 1.35, r * 0.85, r * 1.15]);
    }
    legs.push({ hip, knee, front, side });
  }

  // 꼬리: 엉덩이 뼈에 붙은 튜브. 점은 애니메이터가 매 프레임 계산한다.
  const tailBase = new THREE.Group();
  tailBase.position.set(...at(0, -a * 0.95, cy + b * 0.2));
  bones[0].add(tailBase);
  const tip = E(tailBase, fur, [0, 0, 0], [p.tailR, p.tailR, p.tailR]);
  let tailMesh: THREE.Mesh | null = null;
  const setTail = (pts: THREE.Vector3[]) => {
    if (tailMesh) { tailBase.remove(tailMesh); tailMesh.geometry.dispose(); }
    tailMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, p.tailR, 10), fur);
    tailBase.add(tailMesh);
    tip.position.copy(pts[pts.length - 1]);
  };
  setTail([0, 1, 2, 3].map((i) => new THREE.Vector3(-i * p.tailLen / 3, Math.sin(i / 3 * 2.6) * p.tailLen * p.tailLift, 0)));

  // 눈꺼풀: 눈을 세로로 납작하게 하며 홍채색을 털색 쪽으로 (검은 고양이는 감은 눈이 거의 안 보임)
  const irisOpen = new THREE.Color(C.iris), irisShut = new THREE.Color(C.fur).multiplyScalar(1.6);
  const setEyes = (closed: number) => {
    const k = Math.min(1, Math.max(0, closed));
    for (const eg of eyes) eg.scale.y = 1 - 0.9 * k;
    iris.color.copy(irisOpen).lerp(irisShut, k * k);
  };

  return {
    params: p, root, body, bones, neck, head, ears, eyes, legs, tailBase, setEyes, setTail,
    dispose: () => { disposables.forEach((d) => d.dispose()); tailMesh?.geometry.dispose(); },
  };
}
