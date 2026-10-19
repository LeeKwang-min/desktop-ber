// Windows: per-monitor DPI aware v2의 물리 픽셀 전역 좌표 = 월드 좌표 (GetCursorPos·DWM 프레임과 같은 좌표계)
use crate::geometry::{MonitorInfo, Point, Rect};
use crate::window_list::{is_user_window, RawWindow, WinProps};
use tauri::AppHandle;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetCursorPos, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, GWL_EXSTYLE, GW_OWNER,
};

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

pub fn cursor(_app: &AppHandle) -> Option<Point> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some(Point { x: p.x as f64, y: p.y as f64 })
}

/// EnumWindows는 위(앞)→아래(뒤) 순서로 돈다
pub fn raw_windows() -> Vec<RawWindow> {
    let mut out: Vec<RawWindow> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(collect), LPARAM(&mut out as *mut Vec<RawWindow> as isize));
    }
    out
}

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let out = &mut *(lparam.0 as *mut Vec<RawWindow>);
    let mut class = [0u16; 64];
    let n = GetClassNameW(hwnd, &mut class);
    let props = WinProps {
        visible: IsWindowVisible(hwnd).as_bool(),
        minimized: IsIconic(hwnd).as_bool(),
        cloaked: dwm_u32(hwnd, DWMWA_CLOAKED) != 0,
        ex_style: GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32,
        has_owner: GetWindow(hwnd, GW_OWNER).map(|o| !o.is_invalid()).unwrap_or(false),
        title_len: GetWindowTextLengthW(hwnd),
        class: String::from_utf16_lossy(&class[..n.max(0) as usize]),
    };
    if is_user_window(&props) {
        let mut r = RECT::default();
        let ok = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &mut r as *mut RECT as *mut _, std::mem::size_of::<RECT>() as u32).is_ok();
        if ok {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            out.push(RawWindow {
                id: hwnd.0 as usize as u64,
                pid: pid as i64,
                layer: 0,
                alpha: 1.0,
                rect: Rect { x: r.left as f64, y: r.top as f64, w: (r.right - r.left) as f64, h: (r.bottom - r.top) as f64 },
            });
        }
    }
    BOOL(1) // 계속 열거
}

unsafe fn dwm_u32(hwnd: HWND, attr: windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE) -> u32 {
    let mut v = 0u32;
    let _ = DwmGetWindowAttribute(hwnd, attr, &mut v as *mut u32 as *mut _, 4);
    v
}
