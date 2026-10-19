// 한 모니터에 베르 한 마리를 그린다. 씬 단위 = 이 모니터의 CSS px.
// 캔버스는 모니터 전체가 아니라 베르 주변 정사각형 크기이고, 베르를 따라 CSS transform으로 옮긴다
// (전체화면 캔버스는 4K에서 수백 MB와 화면 합성 비용을 먹는다).
import * as THREE from 'three';
import { buildCat, type CatRig } from './cat/model';
import type { CatParams } from './cat/params';
import { rectContains, type Rect, type Vec2 } from './world';
import { TILT, makeCamera, frameCamera, placeRoot } from './camera';
import { hitCat } from './hit';

export { TILT } from './camera';


function shadowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.38)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

export class CatView {
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: CatRig;
  private scene = new THREE.Scene();
  private shadowScene = new THREE.Scene();
  private shadowGroup = new THREE.Group();
  private camera: THREE.OrthographicCamera;
  private readonly tilt: number;
  private w = 1;
  private h = 1;
  private posCss: Vec2 = { x: 0, y: 0 };
  private lenCss = 130;
  private drewLast = false;
  private size = 0;
  private occluders: Rect[] = [];
  private maskScene = new THREE.Scene();
  private maskCam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
  private maskQuad = new THREE.PlaneGeometry(1, 1);
  // 그린 색과 알파를 0으로 덮어써서 그 부분을 투명하게 만든다 (창에 가려진 것처럼)
  private maskMat = new THREE.MeshBasicMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.ZeroFactor,
  });
  private readonly canvas: HTMLCanvasElement;
  private readonly cosT: number;
  private readonly sinT: number;

  /** tilt: 수직에서 기울인 각도. 갤러리에서 옆모습 확인용으로만 바꾼다. */
  constructor(canvas: HTMLCanvasElement, params: CatParams, tilt = TILT) {
    this.tilt = tilt;
    this.cosT = Math.cos(tilt);
    this.sinT = Math.sin(tilt);
    this.canvas = canvas;
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', willChange: 'transform', display: 'none' });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(-2, 6, -2.5);
    this.scene.add(dl);

    this.rig = buildCat(params);
    this.scene.add(this.rig.root);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.shadowGroup.add(shadow);
    this.shadowScene.add(this.shadowGroup);

    // 수직에서 TILT만큼 기울여 +Z 쪽에서 내려다본다. 바닥점 (x, 0, y/cosT)가 화면 (x, y)에 온다.
    this.camera = makeCamera(tilt);
  }

  /** 모니터(웹뷰) 크기. 캔버스 크기는 render()가 베르 크기에 맞춰 정한다. */
  resize(wCss: number, hCss: number) {
    this.w = wCss; this.h = hCss;
  }

  /** posCss: 캔버스 CSS 좌표, heading: 화면 기준 진행 방향(라디안, y 아래로) */
  place(posCss: Vec2, heading: number, bodyLengthCss: number) {
    this.posCss = posCss;
    this.lenCss = bodyLengthCss;
    const yaw = placeRoot(this.rig.root, posCss, heading, bodyLengthCss, this.tilt);
    this.shadowGroup.position.set(posCss.x + 0.04 * bodyLengthCss, 0, posCss.y / this.cosT + 0.05 * bodyLengthCss);
    this.shadowGroup.rotation.y = -yaw;
    this.shadowGroup.scale.set(bodyLengthCss * 1.15, 1, bodyLengthCss * 0.6);
  }

  /** 베르가 차지할 수 있는 화면 영역(꼬리·수염·그림자 포함 여유) */
  boundsCss(): Rect {
    const r = this.lenCss * 1.3;
    const cx = this.posCss.x, cy = this.posCss.y - this.lenCss * 0.25 * this.sinT;
    return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
  }

  onCanvas(): boolean {
    const b = this.boundsCss();
    return b.x < this.w && b.y < this.h && b.x + b.w > 0 && b.y + b.h > 0;
  }

  /** 베르 주변 정사각형만 그린다: 캔버스를 그 영역으로 옮기고, 카메라도 그 영역만 보게 한다. */
  render() {
    if (!this.onCanvas()) { this.clear(); return; }
    const b = this.boundsCss();
    const x0 = Math.floor(b.x), y0 = Math.floor(b.y), size = Math.ceil(b.w);
    if (size !== this.size) { this.renderer.setSize(size, size, true); this.size = size; }
    // 뷰 공간 y = -화면 y 이므로 위/아래가 음수로 뒤집힌다
    frameCamera(this.camera, x0, y0, size);
    this.canvas.style.transform = `translate(${x0}px, ${y0}px)`;
    this.canvas.style.display = 'block';
    const R = this.renderer;
    R.clear();
    R.render(this.shadowScene, this.camera);
    R.clearDepth();
    R.render(this.scene, this.camera);
    if (this.occluders.length) {
      Object.assign(this.maskCam, { left: x0, right: x0 + size, top: -y0, bottom: -(y0 + size) });
      this.maskCam.updateProjectionMatrix();
      R.render(this.maskScene, this.maskCam);
    }
    this.drewLast = true;
  }

  /** 베르를 가리는 창 사각형들 (캔버스 CSS 좌표). 레이어가 top이면 빈 배열. */
  setOccluders(rectsCss: Rect[]) {
    this.occluders = rectsCss;
    this.maskScene.clear();
    for (const r of rectsCss) {
      const m = new THREE.Mesh(this.maskQuad, this.maskMat);
      m.position.set(r.x + r.w / 2, -(r.y + r.h / 2), 0);
      m.scale.set(r.w, r.h, 1);
      this.maskScene.add(m);
    }
  }

  /** 화면 CSS 점이 베르 몸 위인지 (마지막으로 그린 프레임 기준) */
  hitTest(pCss: Vec2): boolean {
    if (!this.drewLast) return false;
    const b = this.boundsCss();
    if (pCss.x < b.x || pCss.y < b.y || pCss.x > b.x + b.w || pCss.y > b.y + b.h) return false;
    if (this.occluders.some((r) => rectContains(r, pCss))) return false; // 창에 가려진 곳은 아래 창이 클릭을 받는다
    return hitCat(this.rig.root, this.camera, pCss);
  }

  /** 베르가 이 모니터를 떠나면 캔버스를 숨긴다 */
  clear() {
    if (!this.drewLast) return;
    this.canvas.style.display = 'none';
    this.drewLast = false;
  }
}
