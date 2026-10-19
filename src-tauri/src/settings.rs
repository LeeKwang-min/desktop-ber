// 트레이에서 바꾸는 설정. tauri-plugin-store의 settings.json에 저장한다.
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Activity {
    Calm,
    Balanced,
    Active,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Size {
    Small,
    Normal,
    Large,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub activity: Activity,
    pub size: Size,
    pub visible: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self { activity: Activity::Calm, size: Size::Normal, visible: true }
    }
}

impl Settings {
    /// 저장된 값이 없거나 깨졌으면 기본값 (spec §10)
    pub fn from_json(v: Option<serde_json::Value>) -> Self {
        v.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
    }
}

const STORE: &str = "settings.json";
const KEY: &str = "settings";

pub fn load(app: &AppHandle) -> Settings {
    app.store(STORE).map(|s| Settings::from_json(s.get(KEY))).unwrap_or_default()
}

pub fn save(app: &AppHandle, s: &Settings) {
    match app.store(STORE) {
        Ok(store) => {
            store.set(KEY, serde_json::to_value(s).unwrap_or_default());
            if let Err(e) = store.save() {
                eprintln!("settings save: {e}");
            }
        }
        Err(e) => eprintln!("settings store: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn falls_back_to_defaults_for_missing_or_broken_values() {
        assert_eq!(Settings::from_json(None), Settings::default());
        assert_eq!(Settings::from_json(Some(json!("garbage"))), Settings::default());
        let partial = Settings::from_json(Some(json!({ "activity": "active" })));
        assert_eq!(partial, Settings { activity: Activity::Active, ..Settings::default() });
    }

    #[test]
    fn serializes_with_the_names_the_webview_uses() {
        assert_eq!(serde_json::to_value(Settings::default()).unwrap(), json!({ "activity": "calm", "size": "normal", "visible": true }));
    }
}
