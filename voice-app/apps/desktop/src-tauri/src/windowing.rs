use tauri::{App, Manager};

pub fn configure_main_window(app: &mut App) -> tauri::Result<()> {
  if let Some(window) = app.get_webview_window("main") {
    window.set_title("Voice App")?;
  }

  Ok(())
}
