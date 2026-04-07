use tauri::{AppHandle, Emitter, Manager};
use url::Url;

use crate::app_state::AppState;
use crate::windowing;

#[cfg(desktop)]
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;

pub const DEEP_LINK_SCHEME: &str = "voice-app";

pub fn initialize_platform_runtime(app: &AppHandle) -> Result<(), String> {
    sync_auto_launch_setting(app, &app.state::<AppState>())?;
    register_deep_links(app)?;
    refresh_platform_diagnostics(app, None)?;

    #[cfg(desktop)]
    if let Some(urls) = app
        .deep_link()
        .get_current()
        .map_err(|cause| cause.to_string())?
    {
        handle_deep_link_urls(app, urls)?;
    }

    Ok(())
}

pub fn sync_auto_launch_setting(app: &AppHandle, state: &AppState) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let enabled = state.stored_settings().auto_launch_enabled;
        let manager = app.autolaunch();
        if enabled {
            manager.enable().map_err(|cause| cause.to_string())?;
        } else {
            let currently_enabled = manager.is_enabled().map_err(|cause| cause.to_string())?;
            if should_disable_auto_launch(currently_enabled, enabled) {
                manager.disable().map_err(|cause| cause.to_string())?;
            }
        }
    }

    refresh_platform_diagnostics(app, None)
}

pub fn refresh_platform_diagnostics(
    app: &AppHandle,
    last_deep_link: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let diagnostics = {
        let current = state.platform_diagnostics();
        let diagnostics = platform_core::detect_platform_diagnostics()
            .with_hotkey_backend_status(current.hotkey_backend, current.hotkey_backend_error);

        #[cfg(desktop)]
        let diagnostics = diagnostics
            .with_auto_launch_enabled(app.autolaunch().is_enabled().unwrap_or(false))
            .with_deep_link_status(
                app.deep_link()
                    .is_registered(DEEP_LINK_SCHEME)
                    .unwrap_or(false),
                last_deep_link.or_else(|| {
                    app.deep_link()
                        .get_current()
                        .ok()
                        .flatten()
                        .and_then(|urls| urls.first().map(Url::to_string))
                }),
            );

        diagnostics
    };

    state.update_platform_diagnostics(diagnostics.clone());
    app.emit("platform-diagnostics-updated", diagnostics)
        .map_err(|cause| cause.to_string())?;
    Ok(())
}

pub fn sync_hotkey_backend_diagnostics(
    app: &AppHandle,
    hotkey_backend: impl Into<String>,
    hotkey_backend_error: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let diagnostics = state
        .platform_diagnostics()
        .with_hotkey_backend_status(hotkey_backend, hotkey_backend_error);
    state.update_platform_diagnostics(diagnostics.clone());
    app.emit("platform-diagnostics-updated", diagnostics)
        .map_err(|cause| cause.to_string())
}

#[cfg(desktop)]
fn register_deep_links(app: &AppHandle) -> Result<(), String> {
    app.deep_link()
        .register_all()
        .map_err(|cause| cause.to_string())?;

    let app_handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let _ = handle_deep_link_urls(&app_handle, event.urls());
    });

    Ok(())
}

#[cfg(not(desktop))]
fn register_deep_links(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

pub fn handle_deep_link_urls(app: &AppHandle, urls: Vec<Url>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let latest = urls.first().map(Url::to_string);
    if let Some(url) = latest.clone() {
        state.push_info_log(format!("收到 Deep Link: {url}"));
    }

    let _ = windowing::show_main_window(app);
    refresh_platform_diagnostics(app, latest)?;
    app.emit("logs-updated", state.runtime_logs())
        .map_err(|cause| cause.to_string())?;

    Ok(())
}

fn should_disable_auto_launch(currently_enabled: bool, desired_enabled: bool) -> bool {
    !desired_enabled && currently_enabled
}

#[cfg(test)]
mod tests {
    use super::should_disable_auto_launch;

    #[test]
    fn disabled_target_skips_disable_when_runtime_already_disabled() {
        assert!(!should_disable_auto_launch(false, false));
    }

    #[test]
    fn disabled_target_still_disables_when_runtime_reports_enabled() {
        assert!(should_disable_auto_launch(true, false));
    }

    #[test]
    fn enabled_target_never_uses_disable_branch() {
        assert!(!should_disable_auto_launch(true, true));
        assert!(!should_disable_auto_launch(false, true));
    }
}
