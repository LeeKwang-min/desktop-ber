// 비-macOS 임시 구현: Tauri가 보고하는 물리 픽셀 좌표를 월드 좌표로 쓴다.
use crate::geometry::{MonitorInfo, Point, Rect};
use tauri::AppHandle;

pub fn monitors(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    app.available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            let (p, s) = (*m.position(), *m.size());
            MonitorInfo {
                id: format!("{}:{}", p.x, p.y),
                rect: Rect { x: p.x as f64, y: p.y as f64, w: s.width as f64, h: s.height as f64 },
                css_per_world: 1.0 / m.scale_factor(),
                primary: Some(p) == primary,
            }
        })
        .collect()
}

pub fn cursor(app: &AppHandle) -> Option<Point> {
    app.cursor_position().ok().map(|p| Point { x: p.x, y: p.y })
}

/// 계획 D에서 Windows용(EnumWindows)으로 구현한다
pub fn raw_windows() -> Vec<crate::window_list::RawWindow> {
    Vec::new()
}
