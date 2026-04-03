use ipc_contract::RuntimeSnapshot;

#[tauri::command]
pub fn get_runtime_snapshot() -> RuntimeSnapshot {
  RuntimeSnapshot::default()
}

#[tauri::command]
pub fn get_app_mode() -> String {
  "background-agent".to_string()
}
