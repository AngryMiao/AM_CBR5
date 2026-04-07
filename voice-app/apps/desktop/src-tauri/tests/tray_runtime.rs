use voice_app_desktop_lib::{route_tray_menu_action, MenuAction};

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
