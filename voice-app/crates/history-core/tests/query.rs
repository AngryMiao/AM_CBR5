use history_core::{query_history_records, HistoryQuery, HistoryRecord};

#[test]
fn query_history_records_matches_transcript_result_and_status() {
    let records = vec![
        HistoryRecord::with_detail(1, "打开记事本", "已执行", "done", "成功"),
        HistoryRecord::with_detail(2, "打开浏览器", "识别失败", "error", "网络错误"),
    ];

    let query = HistoryQuery {
        keyword: Some("浏览器".to_string()),
        status: Some("error".to_string()),
    };

    let result = query_history_records(&records, &query);

    assert_eq!(result.len(), 1);
    assert_eq!(result[0].id, 2);
}
