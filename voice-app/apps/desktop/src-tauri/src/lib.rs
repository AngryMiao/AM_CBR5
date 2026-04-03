mod app_state;
mod commands;
mod windowing;

pub fn run() {
  tauri::Builder::default()
    .manage(app_state::AppState::default())
    .setup(|app| {
      windowing::configure_main_window(app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::get_app_mode,
      commands::get_runtime_snapshot,
    ])
    .run(tauri::generate_context!())
    .expect("failed to run voice-app desktop")
}
