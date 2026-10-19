// 다른 앱 창 목록: OS 원시값을 공통 구조로 바꾼 뒤 여기서 거른다 (순수 함수, 테스트 대상)
use crate::geometry::Rect;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RawWindow {
    pub id: u64,
    pub pid: i64,
    pub layer: i64,
    pub alpha: f64,
    pub rect: Rect,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct WinInfo {
    pub id: u64,
    pub rect: Rect,
}

const MIN_W: f64 = 80.0;
const MIN_H: f64 = 40.0;

/// 앞→뒤 순서를 유지한 채, 일반 앱 창(레이어 0)이면서 보이고, 내 창이 아니고, 너무 작지 않은 것만 남긴다
pub fn filter(raw: &[RawWindow], own_pid: i64) -> Vec<WinInfo> {
    raw.iter()
        .filter(|w| w.layer == 0 && w.alpha > 0.0 && w.pid != own_pid && w.rect.w >= MIN_W && w.rect.h >= MIN_H)
        .map(|w| WinInfo { id: w.id, rect: w.rect })
        .collect()
}

/// Windows 창의 속성 (win32 값을 그대로 옮긴 것). 판정은 아래 순수 함수가 한다.
#[cfg_attr(not(windows), allow(dead_code))] // Windows에서만 쓰지만 판정 테스트는 모든 OS에서 돈다
#[derive(Clone, Debug, Default)]
pub struct WinProps {
    pub visible: bool,
    pub minimized: bool,
    pub cloaked: bool,
    pub ex_style: u32,
    pub has_owner: bool,
    pub title_len: i32,
    pub class: String,
}

#[cfg_attr(not(windows), allow(dead_code))]
const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
#[cfg_attr(not(windows), allow(dead_code))]
const WS_EX_APPWINDOW: u32 = 0x0004_0000;
#[cfg_attr(not(windows), allow(dead_code))]
const SHELL_CLASSES: [&str; 4] = ["Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Progman", "WorkerW"];

/// 작업 전환(Alt+Tab)에 나오는 사용자 창인지 (spec §7.1 Windows)
#[cfg_attr(not(windows), allow(dead_code))]
pub fn is_user_window(p: &WinProps) -> bool {
    p.visible
        && !p.minimized
        && !p.cloaked
        && p.title_len > 0
        && p.ex_style & WS_EX_TOOLWINDOW == 0
        && (!p.has_owner || p.ex_style & WS_EX_APPWINDOW != 0)
        && !SHELL_CLASSES.contains(&p.class.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(id: u64, pid: i64, layer: i64, alpha: f64, w: f64, h: f64) -> RawWindow {
        RawWindow { id, pid, layer, alpha, rect: Rect { x: 10.0, y: 20.0, w, h } }
    }

    #[test]
    fn keeps_normal_visible_foreign_windows_in_front_to_back_order() {
        let list = [
            raw(1, 100, 0, 1.0, 800.0, 600.0),
            raw(2, 7, 0, 1.0, 800.0, 600.0),   // 내 창
            raw(3, 100, 25, 1.0, 800.0, 24.0), // 메뉴바 등 레이어 0이 아닌 창
            raw(4, 200, 0, 0.0, 800.0, 600.0), // 투명
            raw(5, 200, 0, 1.0, 50.0, 600.0),  // 너무 좁음
            raw(6, 200, 0, 1.0, 400.0, 30.0),  // 너무 낮음
            raw(7, 300, 0, 0.5, 300.0, 200.0),
        ];
        let ids: Vec<u64> = filter(&list, 7).iter().map(|w| w.id).collect();
        assert_eq!(ids, vec![1, 7]);
    }

    #[test]
    fn serializes_as_the_webview_expects() {
        let w = WinInfo { id: 9, rect: Rect { x: 1.0, y: 2.0, w: 3.0, h: 4.0 } };
        assert_eq!(serde_json::to_string(&w).unwrap(), r#"{"id":9,"rect":{"x":1.0,"y":2.0,"w":3.0,"h":4.0}}"#);
    }
    fn app() -> WinProps {
        WinProps { visible: true, title_len: 5, class: "Chrome_WidgetWin_1".into(), ..WinProps::default() }
    }

    #[test]
    fn accepts_normal_app_windows_and_rejects_shell_cloaked_and_tool_windows() {
        assert!(is_user_window(&app()));
        assert!(!is_user_window(&WinProps { visible: false, ..app() }));
        assert!(!is_user_window(&WinProps { minimized: true, ..app() }));
        assert!(!is_user_window(&WinProps { cloaked: true, ..app() }));            // 숨은 UWP 창
        assert!(!is_user_window(&WinProps { title_len: 0, ..app() }));
        assert!(!is_user_window(&WinProps { ex_style: WS_EX_TOOLWINDOW, ..app() }));
        assert!(!is_user_window(&WinProps { has_owner: true, ..app() }));          // 소유된 팝업
        assert!(is_user_window(&WinProps { has_owner: true, ex_style: WS_EX_APPWINDOW, ..app() }));
        assert!(!is_user_window(&WinProps { class: "Shell_TrayWnd".into(), ..app() })); // 작업 표시줄
        assert!(!is_user_window(&WinProps { class: "WorkerW".into(), ..app() }));       // 바탕화면
    }
}
