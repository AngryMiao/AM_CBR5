mod model;

pub use model::HistoryRecord;

use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct HistoryQuery {
    pub keyword: Option<String>,
    pub status: Option<String>,
}

pub fn load_history_records(path: &Path) -> Result<Vec<HistoryRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(path).map_err(|cause| format!("读取历史记录文件失败: {cause}"))?;

    let records: Vec<HistoryRecord> =
        serde_json::from_str(&content).map_err(|cause| format!("解析历史记录文件失败: {cause}"))?;

    Ok(normalize_history_records(records))
}

pub fn save_history_records(path: &Path, records: &[HistoryRecord]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|cause| format!("创建历史记录目录失败: {cause}"))?;
    }

    let content = serde_json::to_string_pretty(records)
        .map_err(|cause| format!("序列化历史记录失败: {cause}"))?;

    fs::write(path, content).map_err(|cause| format!("写入历史记录文件失败: {cause}"))
}

pub fn query_history_records(
    records: &[HistoryRecord],
    query: &HistoryQuery,
) -> Vec<HistoryRecord> {
    let keyword = query.keyword.as_deref().map(str::trim).unwrap_or_default();
    let status = query
        .status
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase();

    records
        .iter()
        .filter(|record| {
            let status_matches =
                status.is_empty() || record.status.trim().eq_ignore_ascii_case(status.as_str());
            let keyword_matches = keyword.is_empty()
                || record.transcript.contains(keyword)
                || record.result.contains(keyword)
                || record.detail.contains(keyword);

            status_matches && keyword_matches
        })
        .cloned()
        .collect()
}

fn normalize_history_records(records: Vec<HistoryRecord>) -> Vec<HistoryRecord> {
    let mut next_available_id = 1;

    records
        .into_iter()
        .map(|record| {
            let id = if record.id == 0 {
                next_available_id
            } else {
                record.id
            };
            let status = if record.status.trim().is_empty() {
                infer_legacy_status(&record)
            } else {
                record.status.clone()
            };

            next_available_id = next_available_id.max(id.saturating_add(1));

            HistoryRecord {
                id,
                status,
                ..record
            }
        })
        .collect()
}

fn infer_legacy_status(record: &HistoryRecord) -> String {
    let result = record.result.to_lowercase();
    let detail = record.detail.to_lowercase();

    if result.contains("失败")
        || detail.contains("失败")
        || result.contains("error")
        || detail.contains("error")
        || result.contains("fail")
        || detail.contains("fail")
    {
        "error".to_string()
    } else {
        "done".to_string()
    }
}
