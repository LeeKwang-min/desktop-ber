mod geometry;
mod overlay;
mod platform;
mod poller;
mod settings;
mod tray;
mod window_list;

use std::sync::Mutex;
use tauri::{AppHandle, Manager, RunEvent, State};

#[tauri::command]
fn get_monitors(app: AppHandle) -> Vec<geometry::MonitorInfo> {
    platform::monitors(&app)
}

#[tauri::command]
fn get_settings(state: State<Mutex<settings::Settings>>) -> settings::Settings {
    *state.lock().unwrap()
}

/// 웹뷰의 로그·오류를 터미널(stderr)로 보낸다. 웹뷰 콘솔은 밖에서 볼 수 없어서 필요하다.
#[tauri::command]
fn log(window: tauri::Window, msg: String) {
    eprintln!("[{}] {msg}", window.label());
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![get_monitors, get_settings, log])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            app.manage(Mutex::new(settings::load(app.handle())));
            tray::build(app.handle())?;
            overlay::rebuild(app.handle());
            poller::start(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Ber")
        .run(|_app, event| {
            // 오버레이를 다시 만들 때 창이 0개가 되어도 앱은 계속 산다. 트레이 "종료"(code: Some)만 종료.
            if let RunEvent::ExitRequested { api, code: None, .. } = event {
                api.prevent_exit();
            }
        });
}
