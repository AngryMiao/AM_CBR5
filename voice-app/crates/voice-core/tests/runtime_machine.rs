use voice_core::RuntimeMachine;

#[test]
fn streaming_runtime_machine_tracks_listen_process_complete_lifecycle() {
    let mut machine = RuntimeMachine::default();
    let idle = machine.snapshot();

    assert_eq!(idle.phase, "待命中");
    assert_eq!(idle.detail, "等待下一次语音任务。");

    machine.start_listening();
    assert_eq!(machine.snapshot().phase, "正在聆听");
    assert_eq!(machine.snapshot().detail, "正在接收语音输入。");

    machine.update_partial_transcript("你好世界");
    let listening = machine.snapshot();
    assert_eq!(listening.phase, "正在聆听");
    assert_eq!(listening.transcript, "你好世界");
    assert_eq!(listening.detail, "正在流式识别语音内容。");

    machine.finish_listening();
    let processing = machine.snapshot();
    assert_eq!(processing.phase, "正在识别");
    assert_eq!(processing.transcript, "你好世界");
    assert_eq!(processing.detail, "正在等待豆包返回最终识别结果。");

    let record = machine.complete_success_with("", "识别完成", "豆包流式识别已完成。");
    let done = machine.snapshot();
    assert_eq!(record.status, "done");
    assert_eq!(done.phase, "已完成");
    assert_eq!(done.transcript, "你好世界");
    assert_eq!(done.result, "识别完成");
    assert_eq!(done.detail, "豆包流式识别已完成。");
}

#[test]
fn reset_clears_transient_runtime_fields() {
    let mut machine = RuntimeMachine::default();

    machine.start_listening();
    machine.update_partial_transcript("临时文本");
    machine.finish_listening();
    machine.complete_error_with("", "识别失败", "网络已断开。");
    machine.reset();

    let snapshot = machine.snapshot();
    assert_eq!(snapshot.phase, "待命中");
    assert_eq!(snapshot.transcript, "");
    assert_eq!(snapshot.result, "");
    assert_eq!(snapshot.detail, "等待下一次语音任务。");
}

#[test]
fn complete_error_with_preserves_partial_transcript_when_final_text_is_empty() {
    let mut machine = RuntimeMachine::default();

    machine.start_listening();
    machine.update_partial_transcript("partial transcript");
    machine.finish_listening();
    let record = machine.complete_error_with("", "识别失败", "豆包鉴权失败。");

    let snapshot = machine.snapshot();
    assert_eq!(record.status, "error");
    assert_eq!(snapshot.phase, "识别失败");
    assert_eq!(snapshot.transcript, "partial transcript");
    assert_eq!(snapshot.result, "识别失败");
    assert_eq!(snapshot.detail, "豆包鉴权失败。");
}

#[test]
fn start_generating_switches_runtime_into_generating_phase() {
    let mut machine = RuntimeMachine::default();

    machine.start_listening();
    machine.update_partial_transcript("今天下午三点提醒我开会");
    machine.finish_listening();
    machine.start_generating_with_transcript(
        "今天下午三点提醒我开会",
        "正在等待 OpenAI-compatible LLM 输出。",
    );

    let snapshot = machine.snapshot();
    assert_eq!(snapshot.phase, "正在生成");
    assert_eq!(snapshot.transcript, "今天下午三点提醒我开会");
    assert_eq!(snapshot.detail, "正在等待 OpenAI-compatible LLM 输出。");
}

#[test]
fn start_executing_switches_runtime_into_executing_phase() {
    let mut machine = RuntimeMachine::default();

    machine.start_generating_with_transcript("帮我打开 Rust 官网", "正在等待工具执行计划。");
    machine.start_executing_with_transcript("帮我打开 Rust 官网", "正在执行打开链接动作。");

    let snapshot = machine.snapshot();
    assert_eq!(snapshot.phase, "正在执行");
    assert_eq!(snapshot.transcript, "帮我打开 Rust 官网");
    assert_eq!(snapshot.detail, "正在执行打开链接动作。");
}

#[test]
fn start_inserting_switches_runtime_into_inserting_phase() {
    let mut machine = RuntimeMachine::default();

    machine.start_generating_with_transcript("输入你好", "正在等待工具执行计划。");
    machine.start_inserting_with_transcript("输入你好", "正在输出文本到当前焦点。");

    let snapshot = machine.snapshot();
    assert_eq!(snapshot.phase, "正在输出");
    assert_eq!(snapshot.transcript, "输入你好");
    assert_eq!(snapshot.detail, "正在输出文本到当前焦点。");
}

#[test]
fn preview_history_record_reuses_existing_transcript_and_result_without_new_task() {
    let mut machine = RuntimeMachine::default();

    machine.load_history_preview("旧转写", "旧结果", "旧详情", "done");

    let snapshot = machine.snapshot();
    assert_eq!(snapshot.phase, "已完成");
    assert_eq!(snapshot.transcript, "旧转写");
    assert_eq!(snapshot.result, "旧结果");
    assert_eq!(snapshot.detail, "旧详情");
}
