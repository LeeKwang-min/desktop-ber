use crate::{geometry::MonitorInfo, overlay, platform, window_list};
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter};

/// 디스플레이가 잠자면(화면 꺼짐·잠금) 활성 모니터 목록이 비어서 온다. 이건 구성 변경이 아니므로
/// 오버레이를 지우지 않는다. 그래야 깨어났을 때 베르가 하던 일을 이어간다.
fn should_rebuild(prev: &[MonitorInfo], next: &[MonitorInfo]) -> bool {
    !next.is_empty() && prev != next
}

/// 커서는 ~30Hz(바뀔 때만), 다른 앱 창은 ~10Hz, 모니터 구성은 ~1Hz로 확인한다.
pub fn start(app: AppHandle) {
    thread::spawn(move || {
        let mut last_cursor = None;
        let mut last_monitors = platform::monitors(&app);
        let mut tick: u64 = 0;
        let mut last_windows: Vec<window_list::WinInfo> = Vec::new();
        loop {
            thread::sleep(Duration::from_millis(33));
            tick = tick.wrapping_add(1);
            let c = platform::cursor(&app);
            if c != last_cursor {
                last_cursor = c;
                let _ = app.emit("cursor", c);
            }
            // 다른 앱 창 목록 ~10Hz. 바뀌었을 때 + 1초마다 한 번(새로 뜬 웹뷰가 받도록)
            if tick % 3 == 0 {
                let w = window_list::filter(&platform::raw_windows(), std::process::id() as i64);
                if w != last_windows || tick % 30 == 0 {
                    let _ = app.emit("windows", &w);
                    last_windows = w;
                }
            }
            if tick % 30 == 0 {
                let m = platform::monitors(&app);
                if should_rebuild(&last_monitors, &m) {
                    last_monitors = m;
                    let handle = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        overlay::rebuild(&handle);
                    });
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{MonitorInfo, Rect};

    fn mon(id: &str) -> MonitorInfo {
        MonitorInfo { id: id.into(), rect: Rect { x: 0.0, y: 0.0, w: 1920.0, h: 1080.0 }, css_per_world: 1.0, primary: true }
    }

    #[test]
    fn ignores_empty_monitor_list_while_displays_sleep() {
        let before = vec![mon("4"), mon("5")];
        assert!(!should_rebuild(&before, &[]));
        assert!(!should_rebuild(&before, &before.clone()));
        assert!(should_rebuild(&before, &[mon("4")]));
        assert!(should_rebuild(&[], &before));
    }
}
