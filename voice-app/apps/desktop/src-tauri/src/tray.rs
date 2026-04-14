use tauri::{
    menu::{MenuBuilder, MenuEvent},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    App, AppHandle,
};

use crate::windowing;

const TRAY_ID: &str = "voice-app-tray";
const SHOW_MAIN_MENU_ID: &str = "show-main";
const HIDE_MAIN_MENU_ID: &str = "hide-main";
const TOGGLE_MAIN_MENU_ID: &str = "toggle-main";
const QUIT_APP_MENU_ID: &str = "quit-app";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuAction {
    ShowMain,
    HideMain,
    ToggleMain,
    QuitApp,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayIconAction {
    ToggleMain,
}

pub fn route_tray_menu_action(id: &str) -> Option<MenuAction> {
    match id {
        SHOW_MAIN_MENU_ID => Some(MenuAction::ShowMain),
        HIDE_MAIN_MENU_ID => Some(MenuAction::HideMain),
        TOGGLE_MAIN_MENU_ID => Some(MenuAction::ToggleMain),
        QUIT_APP_MENU_ID => Some(MenuAction::QuitApp),
        _ => None,
    }
}

pub fn route_tray_icon_action(event: &TrayIconEvent) -> Option<TrayIconAction> {
    match event {
        TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => Some(TrayIconAction::ToggleMain),
        _ => None,
    }
}

pub fn configure_system_tray(app: &mut App) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let menu = MenuBuilder::new(app)
        .text(SHOW_MAIN_MENU_ID, "打开主界面")
        .text(HIDE_MAIN_MENU_ID, "隐藏主界面")
        .text(TOGGLE_MAIN_MENU_ID, "切换主界面")
        .separator()
        .text(QUIT_APP_MENU_ID, "退出 Voice App")
        .build()?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Voice App")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event: MenuEvent| {
            if let Some(action) = route_tray_menu_action(event.id().as_ref()) {
                handle_menu_action(app, action);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let Some(action) = route_tray_icon_action(&event) {
                handle_tray_icon_event(tray.app_handle(), action);
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    let _ = builder.build(app)?;
    Ok(())
}

fn handle_menu_action(app: &AppHandle, action: MenuAction) {
    match action {
        MenuAction::ShowMain => {
            let _ = windowing::show_main_window(app);
        }
        MenuAction::HideMain => {
            let _ = windowing::hide_main_window(app);
        }
        MenuAction::ToggleMain => {
            let _ = windowing::toggle_main_window(app);
        }
        MenuAction::QuitApp => {
            app.exit(0);
        }
    }
}

fn handle_tray_icon_event(app: &AppHandle, action: TrayIconAction) {
    match action {
        TrayIconAction::ToggleMain => {
            let _ = windowing::toggle_main_window(app);
        }
    }
}
