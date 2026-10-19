use crate::{geometry::MonitorInfo, platform};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

static GENERATION: AtomicU32 = AtomicU32::new(0);

/// 기존 오버레이를 모두 닫고 현재 모니터마다 하나씩 다시 만든다.
/// 한 창이 실패해도 나머지는 계속 만든다 (실패는 터미널에 남긴다).
pub fn rebuild(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("overlay-") {
            if let Err(e) = w.destroy() {
                eprintln!("overlay destroy {label}: {e}");
            }
        }
    }
    let gen = GENERATION.fetch_add(1, Ordering::SeqCst);
    for (i, m) in platform::monitors(app).iter().enumerate() {
        let label = format!("overlay-{gen}-{i}");
        if let Err(e) = create(app, &label, m) {
            eprintln!("overlay create {label}: {e}");
        }
    }
}

fn create(app: &AppHandle, label: &str, m: &MonitorInfo) -> tauri::Result<()> {
    let script = format!("window.__BER_MONITOR__ = {};", serde_json::to_string(&m.id).unwrap_or_default());
    let b = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("베르")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .visible(false)
        .initialization_script(&script);
    // Windows: 클릭해도 포커스를 뺏지 않는다 (spec §7.3). tao가 창 스타일을 플래그에서 다시 계산하므로
    // WS_EX_NOACTIVATE를 직접 넣으면 지워진다 — 빌더 플래그로 줘야 유지된다.
    #[cfg(windows)]
    let b = b.focusable(false);
    let w = b.build()?;
    #[cfg(target_os = "macos")]
    {
        w.set_position(tauri::LogicalPosition::new(m.rect.x, m.rect.y))?;
        w.set_size(tauri::LogicalSize::new(m.rect.w, m.rect.h))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        w.set_position(tauri::PhysicalPosition::new(m.rect.x as i32, m.rect.y as i32))?;
        w.set_size(tauri::PhysicalSize::new(m.rect.w as u32, m.rect.h as u32))?;
        // 배율이 다른 모니터로 옮기면 WM_DPICHANGED가 크기·위치를 바꿀 수 있어 한 번 더 맞춘다
        w.set_position(tauri::PhysicalPosition::new(m.rect.x as i32, m.rect.y as i32))?;
    }
    w.set_ignore_cursor_events(true)?;
    w.show()?;
    Ok(())
}
