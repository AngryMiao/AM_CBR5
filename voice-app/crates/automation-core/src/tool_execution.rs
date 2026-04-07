use enigo::{Enigo, Keyboard, Settings};
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolExecutionRuntimePhase {
    Executing,
    Inserting,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ToolExecutionRequest {
    TypeText { text: String },
    OpenUrl { url: String },
}

impl ToolExecutionRequest {
    pub fn type_text(text: impl Into<String>) -> Self {
        Self::TypeText { text: text.into() }
    }

    pub fn open_url(url: impl Into<String>) -> Self {
        Self::OpenUrl { url: url.into() }
    }

    pub fn runtime_phase(&self) -> ToolExecutionRuntimePhase {
        match self {
            Self::TypeText { .. } => ToolExecutionRuntimePhase::Inserting,
            Self::OpenUrl { .. } => ToolExecutionRuntimePhase::Executing,
        }
    }

    pub fn success_message(&self) -> &'static str {
        match self {
            Self::TypeText { .. } => "已将文本输出到当前输入位置。",
            Self::OpenUrl { .. } => "已打开链接。",
        }
    }

    pub fn progress_detail(&self) -> &'static str {
        match self {
            Self::TypeText { .. } => "正在输出文本到当前焦点。",
            Self::OpenUrl { .. } => "正在执行打开链接动作。",
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        match self {
            Self::TypeText { text } => {
                if text.trim().is_empty() {
                    return Err("待输出文本不能为空。".to_string());
                }

                Ok(())
            }
            Self::OpenUrl { url } => {
                let parsed = Url::parse(url)
                    .map_err(|_| "待打开链接不是合法的 http:// 或 https:// 地址。".to_string())?;
                if !matches!(parsed.scheme(), "http" | "https") {
                    return Err("待打开链接不是合法的 http:// 或 https:// 地址。".to_string());
                }

                Ok(())
            }
        }
    }
}

pub trait ToolExecutor: Send + Sync {
    fn execute(&self, request: &ToolExecutionRequest) -> Result<(), String>;
}

#[derive(Default)]
pub struct SystemToolExecutor;

impl ToolExecutor for SystemToolExecutor {
    fn execute(&self, request: &ToolExecutionRequest) -> Result<(), String> {
        request.validate()?;

        match request {
            ToolExecutionRequest::TypeText { text } => {
                let mut enigo = Enigo::new(&Settings::default())
                    .map_err(|cause| format!("初始化输入控制失败: {cause}"))?;
                enigo
                    .text(text)
                    .map_err(|cause| format!("文本输出失败: {cause}"))
            }
            ToolExecutionRequest::OpenUrl { url } => {
                open::that_detached(url).map_err(|cause| format!("打开链接失败: {cause}"))
            }
        }
    }
}
