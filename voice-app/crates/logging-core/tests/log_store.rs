use logging_core::{RuntimeLogEntry, RuntimeLogStore};
use std::fs;

#[test]
fn runtime_log_store_keeps_recent_entries_and_can_clear() {
    let mut store = RuntimeLogStore::with_capacity(2);

    store.push(RuntimeLogEntry::info("第一条"));
    store.push(RuntimeLogEntry::error("第二条"));
    store.push(RuntimeLogEntry::info("第三条"));

    let entries = store.entries();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].message, "第二条");
    assert_eq!(entries[1].message, "第三条");

    store.clear();
    assert!(store.entries().is_empty());
}

#[test]
fn runtime_log_store_exports_entries_to_text_file() {
    let mut store = RuntimeLogStore::with_capacity(4);
    let temp_dir = tempfile::tempdir().expect("temp dir should be created");
    let export_path = temp_dir.path().join("runtime.log");

    store.push(RuntimeLogEntry::info("第一条日志"));
    store.push(RuntimeLogEntry::error("第二条日志"));

    store
        .export_to_path(&export_path)
        .expect("log export should succeed");

    let content = fs::read_to_string(&export_path).expect("exported log file should be readable");
    assert!(content.contains("[info] 第一条日志"));
    assert!(content.contains("[error] 第二条日志"));
}
