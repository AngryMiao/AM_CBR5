pub const HOTKEY_RESTART_THRESHOLD_MS: u64 = 180;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeHotkeyPhase {
    Idle,
    Listening,
    Processing,
    Generating,
    Done,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HotkeyPressDecision {
    StartListening,
    CancelAndArmRestart,
    Noop,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HotkeyReleaseDecision {
    FinishListening,
    CancelListening,
    DismissResult,
    Noop,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HoldToTalkController {
    hold_started_at_ms: Option<u64>,
    interrupted_press_started_at_ms: Option<u64>,
    hold_active: bool,
    interrupted_restart_started: bool,
    threshold_activation_started: bool,
}

impl HoldToTalkController {
    pub fn on_press(&mut self, phase: RuntimeHotkeyPhase, now_ms: u64) -> HotkeyPressDecision {
        self.hold_active = true;

        match phase {
            RuntimeHotkeyPhase::Idle | RuntimeHotkeyPhase::Done | RuntimeHotkeyPhase::Error => {
                self.hold_started_at_ms = Some(now_ms);
                self.interrupted_press_started_at_ms = None;
                self.interrupted_restart_started = false;
                self.threshold_activation_started = false;
                HotkeyPressDecision::Noop
            }
            RuntimeHotkeyPhase::Processing | RuntimeHotkeyPhase::Generating => {
                self.interrupted_press_started_at_ms = Some(now_ms);
                self.interrupted_restart_started = false;
                self.threshold_activation_started = false;
                HotkeyPressDecision::CancelAndArmRestart
            }
            RuntimeHotkeyPhase::Listening => HotkeyPressDecision::Noop,
        }
    }

    pub fn on_interrupt_restart_timer(
        &mut self,
        phase: RuntimeHotkeyPhase,
        now_ms: u64,
    ) -> HotkeyPressDecision {
        if let Some(interrupted_started_at) = self.interrupted_press_started_at_ms {
            if !self.hold_active || self.interrupted_restart_started {
                return HotkeyPressDecision::Noop;
            }

            if now_ms.saturating_sub(interrupted_started_at) < HOTKEY_RESTART_THRESHOLD_MS {
                return HotkeyPressDecision::Noop;
            }

            self.interrupted_restart_started = true;
            self.hold_started_at_ms = Some(now_ms);
            self.threshold_activation_started = true;
            return HotkeyPressDecision::StartListening;
        }

        let Some(hold_started_at) = self.hold_started_at_ms else {
            return HotkeyPressDecision::Noop;
        };

        if !self.hold_active || self.threshold_activation_started {
            return HotkeyPressDecision::Noop;
        }

        if now_ms.saturating_sub(hold_started_at) < HOTKEY_RESTART_THRESHOLD_MS {
            return HotkeyPressDecision::Noop;
        }

        match phase {
            RuntimeHotkeyPhase::Idle | RuntimeHotkeyPhase::Done | RuntimeHotkeyPhase::Error => {
                self.threshold_activation_started = true;
                HotkeyPressDecision::StartListening
            }
            _ => HotkeyPressDecision::Noop,
        }
    }

    pub fn on_release(&mut self, phase: RuntimeHotkeyPhase, now_ms: u64) -> HotkeyReleaseDecision {
        self.hold_active = false;

        let decision = if self.interrupted_press_started_at_ms.is_some() {
            if self.interrupted_restart_started && phase == RuntimeHotkeyPhase::Listening {
                HotkeyReleaseDecision::FinishListening
            } else {
                HotkeyReleaseDecision::Noop
            }
        } else if self.threshold_activation_started {
            if phase == RuntimeHotkeyPhase::Listening {
                HotkeyReleaseDecision::FinishListening
            } else {
                HotkeyReleaseDecision::Noop
            }
        } else if phase == RuntimeHotkeyPhase::Listening {
            let press_duration = self
                .hold_started_at_ms
                .map(|started_at| now_ms.saturating_sub(started_at))
                .unwrap_or_default();

            if press_duration < HOTKEY_RESTART_THRESHOLD_MS {
                HotkeyReleaseDecision::CancelListening
            } else {
                HotkeyReleaseDecision::FinishListening
            }
        } else if phase == RuntimeHotkeyPhase::Done || phase == RuntimeHotkeyPhase::Error {
            HotkeyReleaseDecision::DismissResult
        } else {
            HotkeyReleaseDecision::Noop
        };

        self.hold_started_at_ms = None;
        self.interrupted_press_started_at_ms = None;
        self.interrupted_restart_started = false;
        self.threshold_activation_started = false;

        decision
    }
}
