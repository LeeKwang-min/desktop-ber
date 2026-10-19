// 메뉴바(트레이) 메뉴. 선택은 settings에 저장하고 "command" 이벤트로 두뇌 웹뷰에 알린다.
use crate::settings::{self, Activity, Settings, Size};
use serde_json::json;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Wry,
};
use tauri_plugin_autostart::ManagerExt;

const ACTIVITIES: [(Activity, &str, &str); 3] = [
    (Activity::Calm, "act-calm", "실제 고양이처럼"),
    (Activity::Balanced, "act-balanced", "반반"),
    (Activity::Active, "act-active", "활발하게"),
];
const SIZES: [(Size, &str, &str); 3] = [(Size::Small, "size-small", "작게"), (Size::Normal, "size-normal", "보통"), (Size::Large, "size-large", "크게")];

/// 메뉴 이벤트에서 체크 표시·문구를 바꾸려고 들고 있는 항목들
struct TrayItems {
    visible: MenuItem<Wry>,
    activity: Vec<CheckMenuItem<Wry>>,
    size: Vec<CheckMenuItem<Wry>>,
    autostart: CheckMenuItem<Wry>,
}

fn visible_label(visible: bool) -> &'static str {
    if visible { "숨기기" } else { "보이기" }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let s = *app.state::<Mutex<Settings>>().lock().unwrap();
    let summon = MenuItem::with_id(app, "summon", "이리 와", true, None::<&str>)?;
    let visible = MenuItem::with_id(app, "visible", visible_label(s.visible), true, None::<&str>)?;
    let activity = ACTIVITIES
        .iter()
        .map(|(a, id, label)| CheckMenuItem::with_id(app, *id, *label, true, s.activity == *a, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let size = SIZES
        .iter()
        .map(|(z, id, label)| CheckMenuItem::with_id(app, *id, *label, true, s.size == *z, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "로그인 시 실행", true, app.autolaunch().is_enabled().unwrap_or(false), None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let act_refs: Vec<&dyn IsMenuItem<Wry>> = activity.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
    let size_refs: Vec<&dyn IsMenuItem<Wry>> = size.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
    let activity_menu = Submenu::with_items(app, "활동량", true, &act_refs)?;
    let size_menu = Submenu::with_items(app, "크기", true, &size_refs)?;
    let (sep1, sep2) = (PredefinedMenuItem::separator(app)?, PredefinedMenuItem::separator(app)?);
    let menu = Menu::with_items(app, &[&summon, &visible, &sep1, &activity_menu, &size_menu, &autostart, &sep2, &quit])?;
    app.manage(TrayItems { visible, activity, size, autostart });

    let mut tray = TrayIconBuilder::with_id("ber").tooltip("베르").menu(&menu).on_menu_event(on_menu);
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// 메뉴 선택을 설정에 반영하고, 두뇌 웹뷰에 보낼 명령을 돌려준다 (순수 함수, 테스트 대상).
/// 숨긴 상태에서 "이리 와"를 누르면 베르가 다시 나타나므로 설정도 보이기로 바꾼다.
fn apply_menu(s: &mut Settings, id: &str) -> Option<serde_json::Value> {
    if id == "summon" {
        s.visible = true;
        return Some(json!({ "type": "summon" }));
    }
    if id == "visible" {
        s.visible = !s.visible;
        return Some(json!({ "type": if s.visible { "show" } else { "hide" } }));
    }
    if let Some((a, _, _)) = ACTIVITIES.iter().find(|(_, i, _)| *i == id) {
        s.activity = *a;
        return Some(json!({ "type": "setActivity", "activity": a }));
    }
    if let Some((z, _, _)) = SIZES.iter().find(|(_, i, _)| *i == id) {
        s.size = *z;
        return Some(json!({ "type": "setSize", "size": z }));
    }
    None
}

fn on_menu(app: &AppHandle, e: MenuEvent) {
    let id = e.id().as_ref();
    if id == "quit" {
        app.exit(0);
        return;
    }
    let items = app.state::<TrayItems>();
    if id == "autostart" {
        let al = app.autolaunch();
        let result = if al.is_enabled().unwrap_or(false) { al.disable() } else { al.enable() };
        if let Err(e) = result {
            eprintln!("autostart: {e}");
        }
        let _ = items.autostart.set_checked(al.is_enabled().unwrap_or(false));
        return;
    }
    let state = app.state::<Mutex<Settings>>();
    let mut s = state.lock().unwrap();
    let Some(cmd) = apply_menu(&mut s, id) else { return };
    let _ = app.emit("command", cmd);
    // 체크 메뉴는 macOS가 누른 항목을 토글하므로, 표시를 항상 설정값으로 다시 맞춘다
    let _ = items.visible.set_text(visible_label(s.visible));
    for (item, (a, _, _)) in items.activity.iter().zip(ACTIVITIES.iter()) {
        let _ = item.set_checked(s.activity == *a);
    }
    for (item, (z, _, _)) in items.size.iter().zip(SIZES.iter()) {
        let _ = item.set_checked(s.size == *z);
    }
    settings::save(app, &s);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Activity, Settings, Size};

    #[test]
    fn summoning_while_hidden_makes_ber_visible_again() {
        let mut s = Settings { visible: false, ..Settings::default() };
        assert_eq!(apply_menu(&mut s, "summon"), Some(json!({ "type": "summon" })));
        assert!(s.visible);
    }

    #[test]
    fn toggles_visibility_and_sets_activity_and_size() {
        let mut s = Settings::default();
        assert_eq!(apply_menu(&mut s, "visible"), Some(json!({ "type": "hide" })));
        assert!(!s.visible);
        assert_eq!(apply_menu(&mut s, "visible"), Some(json!({ "type": "show" })));
        assert_eq!(apply_menu(&mut s, "act-active"), Some(json!({ "type": "setActivity", "activity": "active" })));
        assert_eq!(s.activity, Activity::Active);
        assert_eq!(apply_menu(&mut s, "size-large"), Some(json!({ "type": "setSize", "size": "large" })));
        assert_eq!(s.size, Size::Large);
        let before = s;
        assert_eq!(apply_menu(&mut s, "nonsense"), None);
        assert_eq!(s, before);
    }
}
