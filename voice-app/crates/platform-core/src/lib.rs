use cpal::traits::HostTrait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformDiagnostics {
    pub platform_name: String,
    pub supported: bool,
    pub microphone_available: bool,
    pub microphone_permission_status: String,
    pub input_control_permission_status: String,
    pub hotkey_backend: String,
    pub hotkey_backend_error: Option<String>,
    pub auto_launch_enabled: bool,
    pub deep_link_scheme: String,
    pub deep_link_registered: bool,
    pub last_deep_link: Option<String>,
    pub permission_hint: Option<String>,
}

impl PlatformDiagnostics {
    pub fn new(
        platform_name: impl Into<String>,
        supported: bool,
        microphone_available: bool,
        microphone_permission_status: impl Into<String>,
        input_control_permission_status: impl Into<String>,
        hotkey_backend: impl Into<String>,
        hotkey_backend_error: Option<String>,
        auto_launch_enabled: bool,
        deep_link_scheme: impl Into<String>,
        deep_link_registered: bool,
        last_deep_link: Option<String>,
        permission_hint: Option<String>,
    ) -> Self {
        Self {
            platform_name: platform_name.into(),
            supported,
            microphone_available,
            microphone_permission_status: microphone_permission_status.into(),
            input_control_permission_status: input_control_permission_status.into(),
            hotkey_backend: hotkey_backend.into(),
            hotkey_backend_error,
            auto_launch_enabled,
            deep_link_scheme: deep_link_scheme.into(),
            deep_link_registered,
            last_deep_link,
            permission_hint,
        }
    }

    pub fn with_auto_launch_enabled(&self, auto_launch_enabled: bool) -> Self {
        let mut next = self.clone();
        next.auto_launch_enabled = auto_launch_enabled;
        next
    }

    pub fn with_deep_link_status(
        &self,
        deep_link_registered: bool,
        last_deep_link: Option<String>,
    ) -> Self {
        let mut next = self.clone();
        next.deep_link_registered = deep_link_registered;
        next.last_deep_link = last_deep_link;
        next
    }

    pub fn with_hotkey_backend_status(
        &self,
        hotkey_backend: impl Into<String>,
        hotkey_backend_error: Option<String>,
    ) -> Self {
        let mut next = self.clone();
        next.hotkey_backend = hotkey_backend.into();
        next.hotkey_backend_error = hotkey_backend_error;
        next
    }
}

pub fn crate_ready() -> bool {
    true
}

pub fn detect_platform_diagnostics() -> PlatformDiagnostics {
    detect_platform_diagnostics_for(std::env::consts::OS, detect_microphone_available())
}

fn detect_platform_diagnostics_for(
    target_os: &str,
    microphone_available: bool,
) -> PlatformDiagnostics {
    let platform_name = platform_name_for(target_os);
    let supported = matches!(target_os, "windows" | "macos");
    let microphone_permission_status =
        microphone_permission_status_for(supported, microphone_available);
    let input_control_permission_status = input_control_permission_status_for(target_os);
    let permission_hint = permission_hint_for(target_os);

    PlatformDiagnostics::new(
        platform_name,
        supported,
        microphone_available,
        microphone_permission_status,
        input_control_permission_status,
        "待初始化",
        None,
        false,
        "voice-app",
        false,
        None,
        permission_hint.map(str::to_string),
    )
}

fn platform_name_for(target_os: &str) -> &'static str {
    match target_os {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        _ => "Unknown",
    }
}

fn permission_hint_for(target_os: &str) -> Option<&'static str> {
    match target_os {
        "windows" => Some("如无法录音，请检查系统设置中的麦克风权限；如无法注入文本，请确认目标应用与 Voice App 权限级别一致。"),
        "macos" => Some("首次录音前，请在系统设置中授予麦克风权限；如需文本注入，还需授予辅助功能权限。"),
        _ => Some("当前构建仅支持 Windows 与 macOS。"),
    }
}

fn microphone_permission_status_for(supported: bool, microphone_available: bool) -> &'static str {
    if !supported {
        return "不支持";
    }

    if microphone_available {
        "可用"
    } else {
        "待确认"
    }
}

fn input_control_permission_status_for(target_os: &str) -> &'static str {
    match target_os {
        "windows" => "待验证",
        "macos" => "需授权",
        _ => "不支持",
    }
}

fn detect_microphone_available() -> bool {
    cpal::default_host().default_input_device().is_some()
}

#[cfg(test)]
mod tests {
    use super::detect_platform_diagnostics_for;

    #[test]
    fn windows_platform_reports_supported_microphone_ready_state() {
        let diagnostics = detect_platform_diagnostics_for("windows", true);

        assert_eq!(diagnostics.platform_name, "Windows");
        assert!(diagnostics.supported);
        assert!(diagnostics.microphone_available);
        assert_eq!(diagnostics.microphone_permission_status, "可用");
        assert_eq!(diagnostics.input_control_permission_status, "待验证");
        assert_eq!(diagnostics.hotkey_backend, "待初始化");
        assert_eq!(diagnostics.hotkey_backend_error, None);
        assert!(!diagnostics.auto_launch_enabled);
        assert_eq!(diagnostics.deep_link_scheme, "voice-app");
        assert!(!diagnostics.deep_link_registered);
        assert_eq!(diagnostics.last_deep_link, None);
        assert_eq!(
            diagnostics.permission_hint.as_deref(),
            Some("如无法录音，请检查系统设置中的麦克风权限；如无法注入文本，请确认目标应用与 Voice App 权限级别一致。")
        );
    }

    #[test]
    fn unsupported_platform_reports_not_supported() {
        let diagnostics = detect_platform_diagnostics_for("linux", false);

        assert_eq!(diagnostics.platform_name, "Linux");
        assert!(!diagnostics.supported);
        assert!(!diagnostics.microphone_available);
        assert_eq!(diagnostics.microphone_permission_status, "不支持");
        assert_eq!(diagnostics.input_control_permission_status, "不支持");
        assert_eq!(diagnostics.hotkey_backend, "待初始化");
        assert_eq!(diagnostics.hotkey_backend_error, None);
        assert_eq!(
            diagnostics.permission_hint.as_deref(),
            Some("当前构建仅支持 Windows 与 macOS。")
        );
    }

    #[test]
    fn deep_link_and_auto_launch_flags_can_be_updated() {
        let diagnostics = detect_platform_diagnostics_for("macos", true)
            .with_hotkey_backend_status("原生键盘 Hook", Some("native failed".to_string()))
            .with_auto_launch_enabled(true)
            .with_deep_link_status(true, Some("voice-app://history/1".to_string()));

        assert!(diagnostics.auto_launch_enabled);
        assert_eq!(diagnostics.hotkey_backend, "原生键盘 Hook");
        assert_eq!(
            diagnostics.hotkey_backend_error.as_deref(),
            Some("native failed")
        );
        assert!(diagnostics.deep_link_registered);
        assert_eq!(
            diagnostics.last_deep_link.as_deref(),
            Some("voice-app://history/1")
        );
    }
}
