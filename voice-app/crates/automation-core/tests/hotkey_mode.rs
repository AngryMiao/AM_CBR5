use automation_core::{
    HotkeyModeAction, HotkeyModeController, RuntimeHotkeyPhase, VoiceInputMode,
};

#[test]
fn double_tap_from_idle_starts_transcription_listening() {
    let mut controller = HotkeyModeController::default();

    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_000),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_060),
        HotkeyModeAction::Noop
    );

    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_140),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_190),
        HotkeyModeAction::StartTranscriptionListening
    );
}

#[test]
fn single_tap_in_transcription_mode_stops_and_submits() {
    let mut controller = HotkeyModeController::default();

    assert_eq!(
        controller.on_press(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            1_940,
        ),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            2_000,
        ),
        HotkeyModeAction::StopTranscriptionAndSubmit
    );
}

#[test]
fn duplicate_release_right_after_transcription_start_is_ignored() {
    let mut controller = HotkeyModeController::default();

    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_000),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_060),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_140),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_190),
        HotkeyModeAction::StartTranscriptionListening
    );
    assert_eq!(
        controller.on_release(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            1_210,
        ),
        HotkeyModeAction::Noop
    );
}

#[test]
fn delayed_release_without_new_press_after_transcription_start_is_ignored() {
    let mut controller = HotkeyModeController::default();

    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_000),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_060),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_140),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_190),
        HotkeyModeAction::StartTranscriptionListening
    );
    assert_eq!(
        controller.on_release(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            1_500,
        ),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_press(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            1_560,
        ),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            1_620,
        ),
        HotkeyModeAction::StopTranscriptionAndSubmit
    );
}
