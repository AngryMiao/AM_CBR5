use automation_core::{ToolExecutionRequest, ToolExecutionRuntimePhase};

#[test]
fn type_text_requests_prefer_inserting_phase_and_validate_non_empty_text() {
    let request = ToolExecutionRequest::type_text("你好，世界");

    assert_eq!(
        request.runtime_phase(),
        ToolExecutionRuntimePhase::Inserting
    );
    assert_eq!(request.success_message(), "已将文本输出到当前输入位置。");
    assert!(request.validate().is_ok());

    let invalid = ToolExecutionRequest::type_text("   ");
    assert_eq!(
        invalid.validate().expect_err("empty text must be rejected"),
        "待输出文本不能为空。"
    );
}

#[test]
fn open_url_requests_prefer_executing_phase_and_validate_url() {
    let request = ToolExecutionRequest::open_url("https://www.rust-lang.org");

    assert_eq!(
        request.runtime_phase(),
        ToolExecutionRuntimePhase::Executing
    );
    assert_eq!(request.success_message(), "已打开链接。");
    assert!(request.validate().is_ok());

    let invalid = ToolExecutionRequest::open_url("not-a-url");
    assert_eq!(
        invalid
            .validate()
            .expect_err("invalid url must be rejected"),
        "待打开链接不是合法的 http:// 或 https:// 地址。"
    );
}
