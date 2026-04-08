use crate::{
    HoldToTalkController, HotkeyPressDecision, HotkeyReleaseDecision, RuntimeHotkeyPhase,
};

pub const DOUBLE_TAP_WINDOW_MS: u64 = 220;
const TRANSCRIPTION_START_RELEASE_GUARD_MS: u64 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum VoiceInputMode {
    #[default]
    None,
    Agent,
    Transcription,
}

impl VoiceInputMode {
    pub fn as_contract_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Agent => "agent",
            Self::Transcription => "transcription",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HotkeyModeAction {
    StartAgentListening,
    StartTranscriptionListening,
    CancelAndArmRestart,
    FinishAgentListening,
    CancelAgentListening,
    StopTranscriptionAndSubmit,
    DismissResult,
    Noop,
}

#[derive(Clone, Debug, Default)]
pub struct HotkeyModeController {
    hold_to_talk: HoldToTalkController,
    last_idle_tap_released_at_ms: Option<u64>,
    ignore_transcription_release_until_ms: Option<u64>,
    transcription_stop_armed: bool,
}

impl HotkeyModeController {
    pub fn on_press(
        &mut self,
        phase: RuntimeHotkeyPhase,
        input_mode: VoiceInputMode,
        now_ms: u64,
    ) -> HotkeyModeAction {
        if input_mode == VoiceInputMode::Transcription {
            if phase == RuntimeHotkeyPhase::Listening
                && self
                    .ignore_transcription_release_until_ms
                    .map(|deadline| now_ms > deadline)
                    .unwrap_or(true)
            {
                self.transcription_stop_armed = true;
            }
            return HotkeyModeAction::Noop;
        }

        self.transcription_stop_armed = false;

        match self.hold_to_talk.on_press(phase, now_ms) {
            HotkeyPressDecision::StartListening => HotkeyModeAction::StartAgentListening,
            HotkeyPressDecision::CancelAndArmRestart => HotkeyModeAction::CancelAndArmRestart,
            HotkeyPressDecision::Noop => HotkeyModeAction::Noop,
        }
    }

    pub fn on_interrupt_restart_timer(
        &mut self,
        phase: RuntimeHotkeyPhase,
        input_mode: VoiceInputMode,
        now_ms: u64,
    ) -> HotkeyModeAction {
        if input_mode == VoiceInputMode::Transcription {
            return HotkeyModeAction::Noop;
        }

        self.transcription_stop_armed = false;

        match self.hold_to_talk.on_interrupt_restart_timer(phase, now_ms) {
            HotkeyPressDecision::StartListening => HotkeyModeAction::StartAgentListening,
            HotkeyPressDecision::CancelAndArmRestart => HotkeyModeAction::CancelAndArmRestart,
            HotkeyPressDecision::Noop => HotkeyModeAction::Noop,
        }
    }

    pub fn on_release(
        &mut self,
        phase: RuntimeHotkeyPhase,
        input_mode: VoiceInputMode,
        now_ms: u64,
    ) -> HotkeyModeAction {
        if input_mode == VoiceInputMode::Transcription && phase == RuntimeHotkeyPhase::Listening {
            if self
                .ignore_transcription_release_until_ms
                .map(|deadline| now_ms <= deadline)
                .unwrap_or(false)
            {
                return HotkeyModeAction::Noop;
            }

            if !self.transcription_stop_armed {
                return HotkeyModeAction::Noop;
            }

            self.ignore_transcription_release_until_ms = None;
            self.transcription_stop_armed = false;
            self.last_idle_tap_released_at_ms = None;
            return HotkeyModeAction::StopTranscriptionAndSubmit;
        }

        self.ignore_transcription_release_until_ms = None;
        self.transcription_stop_armed = false;

        let is_idle_none = phase == RuntimeHotkeyPhase::Idle && input_mode == VoiceInputMode::None;
        let is_double_tap = is_idle_none && self.is_double_tap(now_ms);

        if is_idle_none {
            self.last_idle_tap_released_at_ms = if is_double_tap { None } else { Some(now_ms) };
        } else {
            self.last_idle_tap_released_at_ms = None;
        }

        let release = self.hold_to_talk.on_release(phase, now_ms);
        if is_double_tap {
            self.ignore_transcription_release_until_ms =
                Some(now_ms.saturating_add(TRANSCRIPTION_START_RELEASE_GUARD_MS));
            self.transcription_stop_armed = false;
            return HotkeyModeAction::StartTranscriptionListening;
        }

        match release {
            HotkeyReleaseDecision::FinishListening => HotkeyModeAction::FinishAgentListening,
            HotkeyReleaseDecision::CancelListening => HotkeyModeAction::CancelAgentListening,
            HotkeyReleaseDecision::DismissResult => HotkeyModeAction::DismissResult,
            HotkeyReleaseDecision::Noop => HotkeyModeAction::Noop,
        }
    }

    fn is_double_tap(&self, now_ms: u64) -> bool {
        self.last_idle_tap_released_at_ms
            .map(|last| now_ms.saturating_sub(last) <= DOUBLE_TAP_WINDOW_MS)
            .unwrap_or(false)
    }
}
