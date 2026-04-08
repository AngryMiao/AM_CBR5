use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;
#[cfg(target_os = "windows")]
use std::{ffi::c_void, mem::size_of};

use ipc_contract::RuntimeSnapshot;
use tauri::{
    webview::Color, App, AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl,
    WebviewWindowBuilder, Window, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const OVERLAY_WINDOW_LABEL: &str = "overlay";
const RESULT_WINDOW_LABEL: &str = "result";
const OVERLAY_WIDTH: f64 = 560.0;
const OVERLAY_HEIGHT: f64 = 128.0;
const RESULT_WIDTH: f64 = 720.0;
const RESULT_HEIGHT: f64 = 520.0;
const OVERLAY_BOTTOM_MARGIN: i32 = 30;
const OVERLAY_AUTO_HIDE_MS: u64 = 4_500;

static OVERLAY_HIDE_TOKEN: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WindowVisibility {
    overlay_visible: bool,
    result_visible: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct WindowBounds {
    x: i32,
    y: i32,
}

pub fn configure_main_window(app: &mut App) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.set_title("Voice App")?;
    }

    ensure_overlay_window(app)?;
    ensure_result_window(app)?;
    relayout_runtime_windows(&app.handle())?;
    sync_runtime_windows(&app.handle(), &RuntimeSnapshot::default())?;

    Ok(())
}

pub fn handle_global_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !should_hide_window_on_close(window.label()) {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}

pub fn sync_runtime_windows(app: &AppHandle, snapshot: &RuntimeSnapshot) -> tauri::Result<()> {
    let visibility = window_visibility_for_snapshot(snapshot);
    relayout_runtime_windows(app)?;

    // overlay/result 是独立 runtime 窗口，不接管主窗口显隐；
    // 否则关闭结果窗或短按中断时会把主窗口重新拉到前台。
    apply_window_visibility(
        app.get_webview_window(OVERLAY_WINDOW_LABEL),
        visibility.overlay_visible,
        false,
    )?;
    apply_window_visibility(
        app.get_webview_window(RESULT_WINDOW_LABEL),
        visibility.result_visible,
        true,
    )?;
    sync_overlay_auto_hide(app.clone(), snapshot, visibility.overlay_visible);

    Ok(())
}

pub(crate) fn show_main_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    let _ = window.unminimize();
    window.show()?;
    let _ = window.set_focus();
    Ok(())
}

pub(crate) fn hide_main_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    window.hide()?;
    Ok(())
}

pub(crate) fn toggle_main_window(app: &AppHandle) -> tauri::Result<()> {
    if main_window_visible(app) {
        return hide_main_window(app);
    }

    show_main_window(app)
}

fn ensure_overlay_window(app: &mut App) -> tauri::Result<()> {
    if app.get_webview_window(OVERLAY_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Voice Overlay")
    .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
    .center()
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true)
    .background_color(Color(0, 0, 0, 0))
    .shadow(false)
    .visible(false)
    .focused(false)
    .build()?;
    let window = app
        .get_webview_window(OVERLAY_WINDOW_LABEL)
        .expect("overlay window should exist after build");
    apply_runtime_window_chrome(window.clone())?;
    window.set_ignore_cursor_events(true)?;

    Ok(())
}

fn ensure_result_window(app: &mut App) -> tauri::Result<()> {
    if app.get_webview_window(RESULT_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        RESULT_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Voice Result")
    .inner_size(RESULT_WIDTH, RESULT_HEIGHT)
    .center()
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true)
    .background_color(Color(0, 0, 0, 0))
    .shadow(false)
    .visible(false)
    .focused(false)
    .build()?;
    let window = app
        .get_webview_window(RESULT_WINDOW_LABEL)
        .expect("result window should exist after build");
    apply_runtime_window_chrome(window)?;

    Ok(())
}

fn apply_window_visibility(
    window: Option<tauri::WebviewWindow>,
    visible: bool,
    focus_on_show: bool,
) -> tauri::Result<()> {
    let Some(window) = window else {
        return Ok(());
    };

    if visible {
        window.show()?;
        if focus_on_show {
            let _ = window.set_focus();
        }
    } else {
        window.hide()?;
    }

    Ok(())
}

fn should_hide_window_on_close(label: &str) -> bool {
    label == MAIN_WINDOW_LABEL || label == OVERLAY_WINDOW_LABEL || label == RESULT_WINDOW_LABEL
}

#[cfg(test)]
fn window_visibility_for_phase(phase: &str) -> WindowVisibility {
    window_visibility_for_snapshot(&RuntimeSnapshot::with_mode(phase, "", "", "", "none"))
}

fn window_visibility_for_snapshot(snapshot: &RuntimeSnapshot) -> WindowVisibility {
    if snapshot.input_mode == "transcription" {
        return WindowVisibility {
            overlay_visible: snapshot.phase != "待命中",
            result_visible: false,
        };
    }

    match snapshot.phase.as_str() {
        "正在聆听" | "正在识别" | "正在生成" | "正在执行" | "正在输出" => {
            WindowVisibility {
                overlay_visible: true,
                result_visible: false,
            }
        }
        "已完成" | "识别失败" => WindowVisibility {
            overlay_visible: false,
            result_visible: true,
        },
        _ => WindowVisibility {
            overlay_visible: false,
            result_visible: false,
        },
    }
}

fn relayout_runtime_windows(app: &AppHandle) -> tauri::Result<()> {
    let work_area = resolve_work_area(app)?;

    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        let bounds = overlay_bounds_for_work_area(work_area);
        window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    }

    if let Some(window) = app.get_webview_window(RESULT_WINDOW_LABEL) {
        let bounds = result_bounds_for_work_area(work_area);
        window.set_position(PhysicalPosition::new(bounds.x, bounds.y))?;
    }

    Ok(())
}

fn resolve_work_area(app: &AppHandle) -> tauri::Result<WorkArea> {
    for label in [MAIN_WINDOW_LABEL, RESULT_WINDOW_LABEL, OVERLAY_WINDOW_LABEL] {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };

        if let Some(monitor) = window.current_monitor()? {
            return Ok(WorkArea {
                x: monitor.work_area().position.x,
                y: monitor.work_area().position.y,
                width: monitor.work_area().size.width,
                height: monitor.work_area().size.height,
            });
        }

        if let Some(monitor) = window.primary_monitor()? {
            return Ok(WorkArea {
                x: monitor.work_area().position.x,
                y: monitor.work_area().position.y,
                width: monitor.work_area().size.width,
                height: monitor.work_area().size.height,
            });
        }
    }

    Ok(WorkArea {
        x: 0,
        y: 0,
        width: RESULT_WIDTH as u32,
        height: RESULT_HEIGHT as u32,
    })
}

fn overlay_bounds_for_work_area(work_area: WorkArea) -> WindowBounds {
    WindowBounds {
        x: work_area.x + ((work_area.width as i32 - OVERLAY_WIDTH as i32) / 2),
        y: work_area.y + work_area.height as i32 - OVERLAY_HEIGHT as i32 - OVERLAY_BOTTOM_MARGIN,
    }
}

fn result_bounds_for_work_area(work_area: WorkArea) -> WindowBounds {
    WindowBounds {
        x: work_area.x + ((work_area.width as i32 - RESULT_WIDTH as i32) / 2),
        y: work_area.y + ((work_area.height as i32 - RESULT_HEIGHT as i32) / 2),
    }
}

fn sync_overlay_auto_hide(app: AppHandle, snapshot: &RuntimeSnapshot, overlay_visible: bool) {
    let token = OVERLAY_HIDE_TOKEN.fetch_add(1, Ordering::SeqCst) + 1;

    if snapshot.input_mode == "transcription"
        || !overlay_visible
        || snapshot.phase != "正在识别"
    {
        return;
    }

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(OVERLAY_AUTO_HIDE_MS));
        if OVERLAY_HIDE_TOKEN.load(Ordering::SeqCst) != token {
            return;
        }

        if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
            let _ = window.hide();
        }
    });
}

fn main_window_visible(app: &AppHandle) -> bool {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .map(|window| window.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

fn apply_runtime_window_chrome(window: tauri::WebviewWindow) -> tauri::Result<()> {
    let _ = window.set_shadow(false);
    let _ = window.hide_menu();
    let _ = window.remove_menu();

    #[cfg(target_os = "windows")]
    suppress_windows_runtime_window_border(&window);

    Ok(())
}

#[cfg(target_os = "windows")]
fn suppress_windows_runtime_window_border(window: &tauri::WebviewWindow) {
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;
    const DWMWCP_DONOTROUND: u32 = 1;

    #[link(name = "dwmapi")]
    unsafe extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut c_void,
            dwAttribute: u32,
            pvAttribute: *const c_void,
            cbAttribute: u32,
        ) -> i32;
    }

    let Ok(hwnd) = window.hwnd() else {
        return;
    };

    let corner_preference = DWMWCP_DONOTROUND;
    let border_color = DWMWA_COLOR_NONE;

    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner_preference as *const _ as *const c_void,
            size_of::<u32>() as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd.0,
            DWMWA_BORDER_COLOR,
            &border_color as *const _ as *const c_void,
            size_of::<u32>() as u32,
        );
    }
}

#[cfg(test)]
mod tests {
    use ipc_contract::RuntimeSnapshot;

    use super::{
        overlay_bounds_for_work_area, result_bounds_for_work_area, should_hide_window_on_close,
        window_visibility_for_phase, window_visibility_for_snapshot, WorkArea, OVERLAY_WIDTH,
    };

    #[test]
    fn shows_overlay_for_listening_phase() {
        let visibility = window_visibility_for_phase("正在聆听");

        assert!(visibility.overlay_visible);
        assert!(!visibility.result_visible);
    }

    #[test]
    fn shows_result_for_done_phase() {
        let visibility = window_visibility_for_phase("已完成");

        assert!(!visibility.overlay_visible);
        assert!(visibility.result_visible);
    }

    #[test]
    fn keeps_overlay_visible_for_generating_phase() {
        let visibility = window_visibility_for_phase("正在生成");

        assert!(visibility.overlay_visible);
        assert!(!visibility.result_visible);
    }

    #[test]
    fn keeps_overlay_visible_for_tool_execution_phases() {
        for phase in ["正在执行", "正在输出"] {
            let visibility = window_visibility_for_phase(phase);

            assert!(visibility.overlay_visible);
            assert!(!visibility.result_visible);
        }
    }

    #[test]
    fn hides_overlay_and_result_for_idle_phase() {
        let visibility = window_visibility_for_phase("待命中");

        assert!(!visibility.overlay_visible);
        assert!(!visibility.result_visible);
    }

    #[test]
    fn transcription_mode_done_state_does_not_show_result_window() {
        let snapshot = RuntimeSnapshot::with_mode(
            "已完成",
            "转录结果",
            "已将文本输出到当前输入位置。",
            "本地工具执行已完成。",
            "transcription",
        );

        let visibility = window_visibility_for_snapshot(&snapshot);
        assert!(visibility.overlay_visible);
        assert!(!visibility.result_visible);
    }

    #[test]
    fn transcription_mode_error_state_does_not_show_result_window() {
        let snapshot = RuntimeSnapshot::with_mode(
            "识别失败",
            "转录结果",
            "识别失败",
            "转录文本输出失败。",
            "transcription",
        );

        let visibility = window_visibility_for_snapshot(&snapshot);
        assert!(visibility.overlay_visible);
        assert!(!visibility.result_visible);
    }

    #[test]
    fn overlay_window_is_wide_enough_for_runtime_capsule() {
        assert!(OVERLAY_WIDTH >= 560.0);
    }

    #[test]
    fn main_window_close_should_hide_to_background() {
        assert!(should_hide_window_on_close("main"));
        assert!(should_hide_window_on_close("overlay"));
        assert!(should_hide_window_on_close("result"));
    }

    #[test]
    fn overlay_bounds_are_centered_horizontally_at_bottom() {
        let bounds = overlay_bounds_for_work_area(WorkArea {
            x: 100,
            y: 50,
            width: 1600,
            height: 900,
        });

        assert_eq!(bounds.x, 620);
        assert_eq!(bounds.y, 792);
    }

    #[test]
    fn result_bounds_are_centered() {
        let bounds = result_bounds_for_work_area(WorkArea {
            x: 40,
            y: 20,
            width: 1440,
            height: 900,
        });

        assert_eq!(bounds.x, 400);
        assert_eq!(bounds.y, 210);
    }
}
