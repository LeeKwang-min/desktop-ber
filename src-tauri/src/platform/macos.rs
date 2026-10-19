// macOS: CoreGraphics 전역 좌표(포인트, 좌상단 원점) = CGWindowList와 같은 좌표계
use crate::geometry::{MonitorInfo, Point, Rect};
use core_graphics::display::CGDisplay;
use core_graphics::event::CGEvent;
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use tauri::AppHandle;

pub fn monitors(_app: &AppHandle) -> Vec<MonitorInfo> {
    let main = CGDisplay::main().id;
    CGDisplay::active_displays()
        .unwrap_or_default()
        .into_iter()
        .map(|id| {
            let b = CGDisplay::new(id).bounds();
            MonitorInfo {
                id: id.to_string(),
                rect: Rect { x: b.origin.x, y: b.origin.y, w: b.size.width, h: b.size.height },
                css_per_world: 1.0,
                primary: id == main,
            }
        })
        .collect()
}

pub fn cursor(_app: &AppHandle) -> Option<Point> {
    let src = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let p = CGEvent::new(src).ok()?.location();
    Some(Point { x: p.x, y: p.y })
}

use crate::window_list::RawWindow;
use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::geometry::CGRect;
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowAlpha, kCGWindowBounds, kCGWindowLayer, kCGWindowListExcludeDesktopElements,
    kCGWindowListOptionOnScreenOnly, kCGWindowNumber, kCGWindowOwnerPID,
};

/// 화면에 보이는 창을 앞→뒤 순서로. 좌표는 CG 전역(포인트, 좌상단 원점) = 월드 좌표. 창 제목은 읽지 않는다(화면 기록 권한 불필요).
pub fn raw_windows() -> Vec<RawWindow> {
    let Some(list) = copy_window_info(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID) else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| {
            let dict: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(*item as CFDictionaryRef) };
            let key = |k: CFStringRef| unsafe { CFString::wrap_under_get_rule(k) };
            let num = |k: CFStringRef| dict.find(&key(k)).and_then(|v| v.downcast::<CFNumber>()).and_then(|n| n.to_f64());
            let bounds = dict
                .find(&key(unsafe { kCGWindowBounds }))
                .and_then(|v| v.downcast::<CFDictionary>())
                .and_then(|d| CGRect::from_dict_representation(&d))?;
            Some(RawWindow {
                id: num(unsafe { kCGWindowNumber })? as u64,
                pid: num(unsafe { kCGWindowOwnerPID })? as i64,
                layer: num(unsafe { kCGWindowLayer })? as i64,
                alpha: num(unsafe { kCGWindowAlpha }).unwrap_or(1.0),
                rect: crate::geometry::Rect { x: bounds.origin.x, y: bounds.origin.y, w: bounds.size.width, h: bounds.size.height },
            })
        })
        .collect()
}
