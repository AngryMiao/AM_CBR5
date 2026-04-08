use ipc_contract::RuntimeSnapshot;

#[test]
fn default_runtime_snapshot_uses_chinese_idle_phase() {
    let snapshot = RuntimeSnapshot::default();

    assert_eq!(snapshot.phase, "待命中");
    assert_eq!(snapshot.transcript, "");
    assert_eq!(snapshot.result, "");
    assert_eq!(snapshot.detail, "等待下一次语音任务。");
}

#[test]
fn default_snapshot_uses_none_input_mode() {
    let snapshot = RuntimeSnapshot::default();

    assert_eq!(snapshot.phase, "待命中");
    assert_eq!(snapshot.input_mode, "none");
}

#[test]
fn snapshot_with_mode_keeps_explicit_input_mode() {
    let snapshot = RuntimeSnapshot::with_mode(
        "正在聆听",
        "实时片段",
        "",
        "正在接收语音输入。",
        "transcription",
    );

    assert_eq!(snapshot.input_mode, "transcription");
    assert_eq!(snapshot.transcript, "实时片段");
}
