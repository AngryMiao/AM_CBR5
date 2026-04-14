use tauri::{
    PhysicalPosition,
    tray::{MouseButton, MouseButtonState, TrayIconEvent, TrayIconId},
    Rect,
};
use voice_app_desktop_lib::{
    route_tray_icon_action, route_tray_menu_action, MenuAction, TrayIconAction,
};

#[test]
fn tray_menu_routes_show_main_action() {
    assert_eq!(
        route_tray_menu_action("show-main"),
        Some(MenuAction::ShowMain)
    );
}

#[test]
fn tray_menu_routes_hide_main_action() {
    assert_eq!(
        route_tray_menu_action("hide-main"),
        Some(MenuAction::HideMain)
    );
}

#[test]
fn tray_menu_routes_toggle_main_action() {
    assert_eq!(
        route_tray_menu_action("toggle-main"),
        Some(MenuAction::ToggleMain)
    );
}

#[test]
fn tray_menu_routes_quit_app_action() {
    assert_eq!(
        route_tray_menu_action("quit-app"),
        Some(MenuAction::QuitApp)
    );
}

#[test]
fn tray_menu_ignores_unknown_action_ids() {
    assert_eq!(route_tray_menu_action("unknown-action"), None);
}

#[test]
fn tray_icon_ignores_single_left_click() {
    let event = TrayIconEvent::Click {
        id: TrayIconId::new("voice-app-tray"),
        position: PhysicalPosition::default(),
        rect: Rect::default(),
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
    };

    assert_eq!(route_tray_icon_action(&event), None);
}

#[test]
fn tray_icon_routes_double_left_click_to_toggle_main_action() {
    let event = TrayIconEvent::DoubleClick {
        id: TrayIconId::new("voice-app-tray"),
        position: PhysicalPosition::default(),
        rect: Rect::default(),
        button: MouseButton::Left,
    };

    assert_eq!(route_tray_icon_action(&event), Some(TrayIconAction::ToggleMain));
}
