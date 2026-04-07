use history_core::HistoryRecord;

#[test]
fn history_record_keeps_transcript_and_result() {
    let record = HistoryRecord::new("hello", "world");
    assert_eq!(record.transcript, "hello");
    assert_eq!(record.result, "world");
}

#[test]
fn history_record_keeps_detail_and_timestamp() {
    let record = HistoryRecord::with_detail(1, "hello", "world", "done", "处理完成");

    assert_eq!(record.detail, "处理完成");
    assert!(!record.created_at.is_empty());
}
