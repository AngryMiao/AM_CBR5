use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use automation_core::ToolExecutionRequest;
use llm_core::{LlmToolRequest, OpenAiCompatibleLlmConfig, OpenAiCompatibleLlmService};
use mcp_core::{McpToolCall, McpToolDescriptor};
use settings_core::StoredVoiceSettings;

fn spawn_chat_completions_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let address = format!(
        "http://{}",
        listener.local_addr().expect("address should exist")
    );

    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("client should connect");
        let mut buffer = [0_u8; 4096];
        let bytes_read = stream.read(&mut buffer).expect("request should read");
        let request = String::from_utf8_lossy(&buffer[..bytes_read]);

        assert!(request.starts_with("POST /chat/completions HTTP/1.1"));
        assert!(request.contains("Authorization: Bearer test-key"));
        assert!(request.contains("\"model\":\"gpt-4o-mini\""));
        assert!(request.contains("用户说：帮我写个日报"));

        let body = r#"{"choices":[{"message":{"content":"这是 LLM 输出"}}]}"#;
        let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body
    );
        stream
            .write_all(response.as_bytes())
            .expect("response should write");
    });

    address
}

#[test]
fn generate_requires_api_key() {
    let service = OpenAiCompatibleLlmService::new(OpenAiCompatibleLlmConfig {
        base_url: "https://api.openai.com/v1".to_string(),
        api_key: None,
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是语音助手。".to_string(),
    });

    let error = service
        .generate("帮我写个日报")
        .expect_err("missing key should fail");

    assert!(error.to_string().contains("LLM API Key 未配置"));
}

#[test]
fn validate_config_rejects_invalid_base_url() {
    let service = OpenAiCompatibleLlmService::new(OpenAiCompatibleLlmConfig {
        base_url: "ws://127.0.0.1/not-http".to_string(),
        api_key: Some("test-key".to_string()),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是语音助手。".to_string(),
    });

    let error = service
        .validate_config()
        .expect_err("invalid base url should fail");

    assert!(error.contains("LLM Base URL 必须是合法的 http:// 或 https:// 地址。"));
}

#[test]
fn generate_calls_openai_compatible_chat_completions() {
    let service = OpenAiCompatibleLlmService::new(OpenAiCompatibleLlmConfig {
        base_url: spawn_chat_completions_server(),
        api_key: Some("test-key".to_string()),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是语音助手。".to_string(),
    });

    let outcome = service
        .generate("帮我写个日报")
        .expect("request should succeed");

    assert_eq!(outcome.text, "这是 LLM 输出");
    assert!(outcome.tool_requests.is_empty());
}

#[test]
fn generate_extracts_openai_compatible_tool_calls_into_tool_requests() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let address = format!(
        "http://{}",
        listener.local_addr().expect("address should exist")
    );

    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("client should connect");
        let mut buffer = [0_u8; 4096];
        let bytes_read = stream.read(&mut buffer).expect("request should read");
        let request = String::from_utf8_lossy(&buffer[..bytes_read]);

        assert!(request.contains("\"tools\":["));
        assert!(request.contains("\"name\":\"type_text\""));
        assert!(request.contains("\"name\":\"open_url\""));

        let body = r#"{
          "choices":[
            {
              "message":{
                "content":null,
                "tool_calls":[
                  {
                    "id":"call_1",
                    "type":"function",
                    "function":{
                      "name":"type_text",
                      "arguments":"{\"text\":\"你好，世界\"}"
                    }
                  },
                  {
                    "id":"call_2",
                    "type":"function",
                    "function":{
                      "name":"open_url",
                      "arguments":"{\"url\":\"https://www.rust-lang.org\"}"
                    }
                  }
                ]
              }
            }
          ]
        }"#;
        let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body
    );
        stream
            .write_all(response.as_bytes())
            .expect("response should write");
    });

    let service = OpenAiCompatibleLlmService::new(OpenAiCompatibleLlmConfig {
        base_url: address,
        api_key: Some("test-key".to_string()),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是语音助手。".to_string(),
    });

    let outcome = service
        .generate("请帮我打开 Rust 官网，并输入你好，世界")
        .expect("request should succeed");

    assert_eq!(outcome.text, "");
    assert_eq!(
        outcome.tool_requests,
        vec![
            LlmToolRequest::Local(ToolExecutionRequest::type_text("你好，世界")),
            LlmToolRequest::Local(ToolExecutionRequest::open_url("https://www.rust-lang.org",)),
        ]
    );
}

#[test]
fn generate_includes_mcp_tools_and_parses_mcp_tool_calls() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let address = format!(
        "http://{}",
        listener.local_addr().expect("address should exist")
    );

    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("client should connect");
        let mut buffer = [0_u8; 8192];
        let bytes_read = stream.read(&mut buffer).expect("request should read");
        let request = String::from_utf8_lossy(&buffer[..bytes_read]);

        assert!(request.contains("\"name\":\"mcp__system_control__type_text\""));
        assert!(request.contains("\"description\":\"通过 MCP 输出文本\""));

        let body = r#"{
          "choices":[
            {
              "message":{
                "content":null,
                "tool_calls":[
                  {
                    "id":"call_1",
                    "type":"function",
                    "function":{
                      "name":"mcp__system_control__type_text",
                      "arguments":"{\"text\":\"你好，MCP\"}"
                    }
                  }
                ]
              }
            }
          ]
        }"#;
        let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body
    );
        stream
            .write_all(response.as_bytes())
            .expect("response should write");
    });

    let service = OpenAiCompatibleLlmService::new(OpenAiCompatibleLlmConfig {
        base_url: address,
        api_key: Some("test-key".to_string()),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是语音助手。".to_string(),
    });

    let mcp_tools = vec![McpToolDescriptor {
        qualified_name: "mcp__system_control__type_text".to_string(),
        server_id: "system-control".to_string(),
        tool_name: "type_text".to_string(),
        description: "通过 MCP 输出文本".to_string(),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "text": { "type": "string" }
            },
            "required": ["text"]
        }),
    }];

    let outcome = service
        .generate_with_mcp_tools("通过 MCP 输入你好", &mcp_tools)
        .expect("request should succeed");

    assert_eq!(outcome.text, "");
    assert_eq!(
        outcome.tool_requests,
        vec![LlmToolRequest::Mcp(McpToolCall {
            server_id: "system-control".to_string(),
            tool_name: "type_text".to_string(),
            arguments: serde_json::json!({ "text": "你好，MCP" }),
        })]
    );
}

#[test]
fn generate_rejects_empty_message_content() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let address = format!(
        "http://{}",
        listener.local_addr().expect("address should exist")
    );

    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("client should connect");
        let mut buffer = [0_u8; 2048];
        let _ = stream.read(&mut buffer);

        let body = r#"{"choices":[{"message":{"content":""}}]}"#;
        let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body
    );
        stream
            .write_all(response.as_bytes())
            .expect("response should write");
    });

    let service = OpenAiCompatibleLlmService::new(OpenAiCompatibleLlmConfig {
        base_url: address,
        api_key: Some("test-key".to_string()),
        model: "gpt-4o-mini".to_string(),
        system_prompt: "你是语音助手。".to_string(),
    });

    let error = service
        .generate("帮我写个日报")
        .expect_err("empty message should fail");

    assert!(error.to_string().contains("LLM 返回空结果"));
}

#[test]
fn builds_llm_config_from_stored_settings() {
    let mut settings = StoredVoiceSettings::default();
    settings.llm_base_url = "https://example.com/v1".to_string();
    settings.llm_api_key = "stored-key".to_string();
    settings.llm_model = "gpt-4.1-mini".to_string();
    settings.llm_system_prompt = "你是测试助手。".to_string();

    let config = OpenAiCompatibleLlmConfig::from_settings(&settings);

    assert_eq!(config.base_url, "https://example.com/v1");
    assert_eq!(config.api_key.as_deref(), Some("stored-key"));
    assert_eq!(config.model, "gpt-4.1-mini");
    assert!(config.system_prompt.contains("你是测试助手。"));
    assert!(config.system_prompt.contains("AngryMiao 键盘控制映射"));
    assert!(config.system_prompt.contains("复制 / 拷贝"));
    assert!(config.system_prompt.contains("keyboard_control"));
}

#[test]
fn builds_turn_aware_llm_config_with_skill_prompt_assets() {
    let mut settings = StoredVoiceSettings::default();
    settings.llm_system_prompt = "你是测试助手。".to_string();

    let config = OpenAiCompatibleLlmConfig::from_settings_for_turn(
        &settings,
        "请帮我复制这段内容",
        Some("---\nname: test\n---\n# Angrymiao Voice Control\nUse keyboard control."),
        Some("KeyA => 11070004"),
    );

    assert!(config.system_prompt.contains("Use keyboard control."));
    assert!(config
        .system_prompt
        .contains("Current Turn Shortcut Directive"));
    assert!(config.system_prompt.contains("KeyA => 11070004"));
}
