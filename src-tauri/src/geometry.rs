use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub rect: Rect,
    pub css_per_world: f64,
    pub primary: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_info_serializes_camel_case() {
        let m = MonitorInfo { id: "1".into(), rect: Rect { x: -1.0, y: 0.0, w: 2.0, h: 3.0 }, css_per_world: 1.0, primary: true };
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, r#"{"id":"1","rect":{"x":-1.0,"y":0.0,"w":2.0,"h":3.0},"cssPerWorld":1.0,"primary":true}"#);
    }
}
