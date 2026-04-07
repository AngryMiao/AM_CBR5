use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeLogEntry {
    pub level: String,
    pub message: String,
}

impl RuntimeLogEntry {
    pub fn info(message: impl Into<String>) -> Self {
        Self {
            level: "info".to_string(),
            message: message.into(),
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            level: "error".to_string(),
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeLogStore {
    capacity: usize,
    entries: VecDeque<RuntimeLogEntry>,
}

impl Default for RuntimeLogStore {
    fn default() -> Self {
        Self::with_capacity(200)
    }
}

impl RuntimeLogStore {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            entries: VecDeque::new(),
        }
    }

    pub fn push(&mut self, entry: RuntimeLogEntry) {
        while self.entries.len() >= self.capacity {
            self.entries.pop_front();
        }

        self.entries.push_back(entry);
    }

    pub fn entries(&self) -> Vec<RuntimeLogEntry> {
        self.entries.iter().cloned().collect()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    pub fn export_to_path(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|cause| format!("创建日志目录失败: {cause}"))?;
        }

        let content = self
            .entries
            .iter()
            .map(|entry| format!("[{}] {}", entry.level, entry.message))
            .collect::<Vec<_>>()
            .join("\n");

        fs::write(path, content).map_err(|cause| format!("导出日志失败: {cause}"))
    }
}
