use ipc_contract::RuntimeSnapshot;
use voice_core::RuntimePhase;

#[test]
fn runtime_phase_internal_default_stays_idle() {
    assert_eq!(RuntimePhase::default().as_str(), "idle");
}

#[test]
fn runtime_phase_reports_chinese_contract_labels() {
    assert_eq!(RuntimePhase::Idle.as_contract_str(), "待命中");
    assert_eq!(RuntimePhase::Listening.as_contract_str(), "正在聆听");
    assert_eq!(RuntimePhase::Processing.as_contract_str(), "正在识别");
    assert_eq!(RuntimePhase::Generating.as_contract_str(), "正在生成");
    assert_eq!(RuntimePhase::Executing.as_contract_str(), "正在执行");
    assert_eq!(RuntimePhase::Inserting.as_contract_str(), "正在输出");
    assert_eq!(RuntimePhase::Done.as_contract_str(), "已完成");
    assert_eq!(RuntimePhase::Error.as_contract_str(), "识别失败");
}

#[test]
fn runtime_snapshot_defaults_include_chinese_contract_fields() {
    let snapshot = RuntimeSnapshot::default();

    assert_eq!(snapshot.phase, "待命中");
    assert_eq!(snapshot.transcript, "");
    assert_eq!(snapshot.result, "");
    assert_eq!(snapshot.detail, "等待下一次语音任务。");
}
