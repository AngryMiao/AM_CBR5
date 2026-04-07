use std::path::PathBuf;

use history_core::{load_history_records, save_history_records, HistoryRecord};

#[test]
fn missing_history_file_returns_empty_records() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("history.json");

    let records =
        load_history_records(&path).expect("missing file should be treated as empty history");

    assert!(records.is_empty());
}

#[test]
fn saves_and_loads_history_records_as_json() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("history.json");
    let records = vec![
        HistoryRecord::with_status(1, "第一条转写", "第一条结果", "done"),
        HistoryRecord::with_status(2, "第二条转写", "第二条结果", "error"),
    ];

    save_history_records(&path, &records).expect("history should be written to disk");

    let loaded = load_history_records(&path).expect("history should be read from disk");

    assert_eq!(loaded, records);
    assert!(PathBuf::from(&path).exists());
}

#[test]
fn loads_legacy_history_records_without_dropping_them() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("history.json");
    std::fs::write(
        &path,
        r#"
      [
        {"transcript":"旧转写","result":"旧结果"},
        {"transcript":"旧失败","result":"识别失败"}
      ]
    "#,
    )
    .expect("legacy history should be seeded");

    let loaded = load_history_records(&path).expect("legacy history should still load");

    assert_eq!(loaded.len(), 2);
    assert_eq!(loaded[0].id, 1);
    assert_eq!(loaded[0].status, "done");
    assert_eq!(loaded[0].transcript, "旧转写");
    assert_eq!(loaded[1].id, 2);
    assert_eq!(loaded[1].status, "error");
    assert_eq!(loaded[1].transcript, "旧失败");
}
