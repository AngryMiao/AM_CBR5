use history_core::HistoryRecord;

#[test]
fn history_record_keeps_transcript_and_result() {
  let record = HistoryRecord::new("hello", "world");
  assert_eq!(record.transcript, "hello");
  assert_eq!(record.result, "world");
}
