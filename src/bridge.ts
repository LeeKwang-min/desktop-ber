// Tauri 의존은 이 파일에만 둔다.
import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { MonitorInfo, Vec2, WinInfo } from './world';
import type { Activity, SizeName } from './brain/presets';

/** Rust 트레이가 보내는 명령 (크기는 이름으로 오고, 오버레이가 CSS px로 바꾼다) */
export type TrayCommand =
  | { type: 'summon' } | { type: 'hide' } | { type: 'show' }
  | { type: 'setActivity'; activity: Activity }
  | { type: 'setSize'; size: SizeName };
export interface RustSettings { activity: Activity; size: SizeName; visible: boolean }

declare global { interface Window { __BER_MONITOR__?: string } }

export const bridge = {
  monitorId: window.__BER_MONITOR__,
  getMonitors: () => invoke<MonitorInfo[]>('get_monitors'),
  /** 이 웹뷰 창의 실제 좌상단(월드 좌표). OS가 창 위치를 조정했을 수 있어 직접 확인한다. */
  async windowOriginWorld(): Promise<Vec2> {
    const w = getCurrentWindow();
    const p = await w.outerPosition();
    const k = navigator.userAgent.includes('Mac') ? await w.scaleFactor() : 1;
    return { x: p.x / k, y: p.y / k };
  },
  onCursor: (cb: (p: Vec2 | null) => void): Promise<UnlistenFn> => listen<Vec2 | null>('cursor', (e) => cb(e.payload)),
  onCatState: <T>(cb: (s: T) => void): Promise<UnlistenFn> => listen<T>('cat-state', (e) => cb(e.payload)),
  sendCatState: <T>(s: T): Promise<void> => emit('cat-state', s),
  getSettings: () => invoke<RustSettings>('get_settings'),
  onCommand: (cb: (c: TrayCommand) => void): Promise<UnlistenFn> => listen<TrayCommand>('command', (e) => cb(e.payload)),
  sendClick: (): Promise<void> => emit('cat-click'),
  onClick: (cb: () => void): Promise<UnlistenFn> => listen('cat-click', () => cb()),
  onWindows: (cb: (w: WinInfo[]) => void): Promise<UnlistenFn> => listen<WinInfo[]>('windows', (e) => cb(e.payload)),
  setClickThrough: (on: boolean): Promise<void> => getCurrentWindow().setIgnoreCursorEvents(on),
  /** 터미널(stderr)로 로그를 보낸다 */
  log: (msg: string): void => { void invoke('log', { msg }).catch(() => {}); },
};

// 웹뷰에서 난 오류는 밖에서 안 보이므로 터미널로 흘려보낸다
addEventListener('error', (e) => bridge.log(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => bridge.log(`unhandled rejection: ${String(e.reason?.stack ?? e.reason)}`));
