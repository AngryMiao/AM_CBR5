mod app_state;
mod commands;
mod hotkeys;
mod platform_runtime;
mod skill_bundles;
mod tray;
mod windowing;

use std::path::PathBuf;

use tauri::Manager;

pub use hotkeys::{
    fallback_hotkey_validation_error, resolve_hotkey_backend_diagnostics,
    resolve_hotkey_backend_mode, route_native_hook_event, HookEventRoutingDecision,
    HotkeyBackendDiagnostics, HotkeyBackendMode,
};
pub use tray::{route_tray_menu_action, MenuAction};

pub fn run() {
    #[cfg(target_os = "windows")]
    configure_webview2_runtime_background();

    let app_state = app_state::AppState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = windowing::show_main_window(app);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .on_menu_event(tray::handle_app_menu_event)
        .on_window_event(windowing::handle_global_window_event)
        .manage(app_state)
        .manage(hotkeys::HotkeyRuntimeState::default())
        .setup(|app| {
            windowing::configure_main_window(app)?;
            tray::configure_application_menu(app)?;
            let app_data_dir = app.path().app_data_dir()?;
            let history_store = history_store_path(&app_data_dir);
            let settings_store = settings_store_path(&app_data_dir);
            let state = app.state::<app_state::AppState>();
            state.configure_app_data_dir(app_data_dir);
            state.configure_skill_bundle_root(skill_bundles::default_skill_bundle_root());
            state
                .configure_history_store(history_store)
                .map_err(std::io::Error::other)?;
            state
                .configure_settings_store(settings_store)
                .map_err(std::io::Error::other)?;
            if let Err(cause) = platform_runtime::initialize_platform_runtime(&app.handle()) {
                state.push_error_log(format!("平台集成初始化失败: {cause}"));
            }
            tray::configure_system_tray(app)?;
            hotkeys::configure_global_hotkeys(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_runtime_snapshot,
            commands::get_history_records,
            commands::query_history_records,
            commands::preview_history_record,
            commands::retry_history_record,
            commands::get_voice_settings,
            commands::get_editable_settings,
            commands::list_microphone_inputs,
            commands::save_editable_settings,
            commands::reset_editable_settings,
            commands::get_runtime_logs,
            commands::clear_runtime_logs,
            commands::export_runtime_logs,
            commands::get_platform_diagnostics,
            commands::get_runtime_diagnostics,
            commands::list_skill_bundles,
            commands::read_skill_bundle_text,
            commands::install_skill_bundle,
            commands::start_microphone_capture,
            commands::stop_microphone_capture,
            commands::dismiss_runtime_result,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run voice-app desktop")
}

#[cfg(target_os = "windows")]
fn configure_webview2_runtime_background() {
    if std::env::var_os("WEBVIEW2_DEFAULT_BACKGROUND_COLOR").is_none() {
        std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");
    }
}

fn history_store_path(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join("history.json")
}

fn settings_store_path(app_data_dir: &std::path::Path) -> PathBuf {
    app_data_dir.join("settings.json")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{history_store_path, settings_store_path};

    #[test]
    fn history_store_path_uses_app_data_dir() {
        let path = history_store_path(Path::new("C:/voice-app-data"));

        assert_eq!(path, Path::new("C:/voice-app-data").join("history.json"));
    }

    #[test]
    fn settings_store_path_uses_app_data_dir() {
        let path = settings_store_path(Path::new("C:/voice-app-data"));

        assert_eq!(path, Path::new("C:/voice-app-data").join("settings.json"));
    }
}
