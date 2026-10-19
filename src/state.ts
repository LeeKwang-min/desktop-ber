// 두뇌가 만들고 렌더러가 소비하는 상태 타입. 두 쪽이 같은 정의를 쓰도록 한 곳에 둔다 (순수 TS).
import type { Vec2 } from './world';
import type { PoseName } from './cat/graph';
import type { Activity } from './brain/presets';

export type Gait = 'none' | 'walk' | 'run';
export interface Overlays { purr: boolean; tailThump: boolean; earTwitch: boolean }
export const NO_OVERLAYS: Overlays = { purr: false, tailThump: false, earTwitch: false };
export type Layer = { kind: 'top' } | { kind: 'under'; windowId: number };

export interface CatState {
  pos: Vec2;            // 월드 좌표
  heading: number;      // 화면 기준 라디안 (y 아래로)
  pose: PoseName;       // 목표 자세
  gait: Gait;
  speed: number;        // 몸길이/초
  overlays: Overlays;
  layer: Layer;
  lookAt: Vec2 | null;  // 바라볼 점 (월드)
  visible: boolean;
  behavior: string;
  bodyLengthCss: number;
}

export type Command =
  | { type: 'summon' } | { type: 'hide' } | { type: 'show' }
  | { type: 'setActivity'; activity: Activity }
  | { type: 'setSize'; bodyLengthCss: number };
