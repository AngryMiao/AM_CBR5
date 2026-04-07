use ipc_contract::RuntimeSnapshot;

#[test]
fn default_runtime_snapshot_uses_chinese_idle_phase() {
    let snapshot = RuntimeSnapshot::default();

    assert_eq!(snapshot.phase, "待命中");
    assert_eq!(snapshot.transcript, "");
    assert_eq!(snapshot.result, "");
    assert_eq!(snapshot.detail, "等待下一次语音任务。");
}
