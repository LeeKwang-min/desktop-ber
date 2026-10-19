// 확정 외형 (spec §5.1). 단위는 모델 단위, 렌더 시 몸 길이에 맞춰 스케일한다.
export interface CatParams {
  a: number; b: number; c: number; rump: number;
  legLen: number; legR: number;
  tailLen: number; tailR: number; tailLift: number;
  headR: number; headScale: [number, number, number]; hx: number; hy: number;
  cheek: number; pad: number;
  ear: { h: number; r: number; tilt: number };
  eye: { r: number; spread: number; height: number };
  whisker: number;
  colors: { fur: number; white: number; nose: number; pupil: number; iris: number };
  toonLevels: number[];
  rim: { strength: number; color: [number, number, number]; power: number };
}

export const BER: CatParams = {
  a: 0.46, b: 0.21, c: 0.25, rump: 1.12,
  legLen: 0.2, legR: 0.05,
  tailLen: 0.72, tailR: 0.042, tailLift: 0.22,
  headR: 0.2, headScale: [1, 0.9, 1.08], hx: 0.86, hy: 0.6,
  cheek: 0.55, pad: 1,
  ear: { h: 0.2, r: 0.095, tilt: 0.45 },
  eye: { r: 0.16, spread: 0.4, height: 0.1 },
  whisker: 2.0,
  colors: { fur: 0x23252b, white: 0xf4f3ee, nose: 0x1a1a1d, pupil: 0x0c0c0e, iris: 0xc5d63d },
  toonLevels: [60, 105, 150, 200, 255],
  rim: { strength: 0.35, color: [0.62, 0.71, 0.85], power: 3 },
};

/** 코끝~엉덩이 길이(모델 단위). 화면 몸 길이(CSS px) 환산 기준 */
export const MODEL_BODY_LENGTH = 1.2;
