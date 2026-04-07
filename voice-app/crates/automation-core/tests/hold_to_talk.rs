use automation_core::{
    HoldToTalkController, HotkeyPressDecision, HotkeyReleaseDecision, RuntimeHotkeyPhase,
    HOTKEY_RESTART_THRESHOLD_MS,
};

#[test]
fn short_tap_from_idle_waits_for_threshold_before_starting() {
    let mut controller = HoldToTalkController::default();

    let press = controller.on_press(RuntimeHotkeyPhase::Idle, 1_000);
    assert_eq!(press, HotkeyPressDecision::Noop);

    assert_eq!(
        controller.on_interrupt_restart_timer(
            RuntimeHotkeyPhase::Idle,
            1_000 + HOTKEY_RESTART_THRESHOLD_MS - 1,
        ),
        HotkeyPressDecision::Noop
    );
    assert_eq!(
        controller.on_interrupt_restart_timer(
            RuntimeHotkeyPhase::Idle,
            1_000 + HOTKEY_RESTART_THRESHOLD_MS,
        ),
        HotkeyPressDecision::StartListening
    );
}

#[test]
fn long_hold_after_threshold_finishes_recording() {
    let mut controller = HoldToTalkController::default();

    controller.on_press(RuntimeHotkeyPhase::Idle, 1_000);
    assert_eq!(
        controller.on_interrupt_restart_timer(
            RuntimeHotkeyPhase::Idle,
            1_000 + HOTKEY_RESTART_THRESHOLD_MS,
        ),
        HotkeyPressDecision::StartListening
    );
    let release = controller.on_release(
        RuntimeHotkeyPhase::Listening,
        1_000 + HOTKEY_RESTART_THRESHOLD_MS + 20,
    );

    assert_eq!(release, HotkeyReleaseDecision::FinishListening);
}

#[test]
fn interruptible_phase_arms_restart_after_threshold() {
    let mut controller = HoldToTalkController::default();

    let press = controller.on_press(RuntimeHotkeyPhase::Generating, 5_000);
    assert_eq!(press, HotkeyPressDecision::CancelAndArmRestart);

    assert_eq!(
        controller.on_interrupt_restart_timer(RuntimeHotkeyPhase::Idle, 5_050),
        HotkeyPressDecision::Noop
    );
    assert_eq!(
        controller.on_interrupt_restart_timer(
            RuntimeHotkeyPhase::Idle,
            5_000 + HOTKEY_RESTART_THRESHOLD_MS,
        ),
        HotkeyPressDecision::StartListening
    );
}

#[test]
fn short_tap_from_result_dismisses_result_instead_of_restarting() {
    let mut controller = HoldToTalkController::default();

    let press = controller.on_press(RuntimeHotkeyPhase::Done, 8_000);
    assert_eq!(press, HotkeyPressDecision::Noop);

    let release = controller.on_release(RuntimeHotkeyPhase::Done, 8_100);
    assert_eq!(release, HotkeyReleaseDecision::DismissResult);
}
