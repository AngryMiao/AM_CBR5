#[derive(Default, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimePhase {
    #[default]
    Idle,
    Listening,
    Processing,
    Generating,
    Executing,
    Inserting,
    Done,
    Error,
}

impl RuntimePhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Listening => "listening",
            Self::Processing => "processing",
            Self::Generating => "generating",
            Self::Executing => "executing",
            Self::Inserting => "inserting",
            Self::Done => "done",
            Self::Error => "error",
        }
    }

    pub fn as_contract_str(&self) -> &'static str {
        match self {
            Self::Idle => "待命中",
            Self::Listening => "正在聆听",
            Self::Processing => "正在识别",
            Self::Generating => "正在生成",
            Self::Executing => "正在执行",
            Self::Inserting => "正在输出",
            Self::Done => "已完成",
            Self::Error => "识别失败",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "idle" => Some(Self::Idle),
            "listening" => Some(Self::Listening),
            "processing" => Some(Self::Processing),
            "generating" => Some(Self::Generating),
            "executing" => Some(Self::Executing),
            "inserting" => Some(Self::Inserting),
            "done" => Some(Self::Done),
            "error" => Some(Self::Error),
            _ => None,
        }
    }
}
