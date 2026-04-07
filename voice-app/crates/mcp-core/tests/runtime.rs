use std::collections::{BTreeMap, VecDeque};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use mcp_core::{
    McpRuntime, McpServerConfig, McpToolCall, McpToolDescriptor, McpTransport, McpTransportFactory,
};

#[derive(Clone, Default)]
struct StubFactory {
    sent_messages: Arc<Mutex<Vec<Value>>>,
    queued_responses: Arc<Mutex<VecDeque<Value>>>,
}

impl StubFactory {
    fn with_responses(responses: Vec<Value>) -> Self {
        Self {
            sent_messages: Arc::new(Mutex::new(Vec::new())),
            queued_responses: Arc::new(Mutex::new(VecDeque::from(responses))),
        }
    }
}

struct StubTransport {
    sent_messages: Arc<Mutex<Vec<Value>>>,
    queued_responses: Arc<Mutex<VecDeque<Value>>>,
}

impl McpTransport for StubTransport {
    fn send_json(&mut self, message: &Value) -> Result<(), String> {
        self.sent_messages
            .lock()
            .expect("sent messages lock should succeed")
            .push(message.clone());
        Ok(())
    }

    fn recv_json(&mut self) -> Result<Value, String> {
        self.queued_responses
            .lock()
            .expect("queued responses lock should succeed")
            .pop_front()
            .ok_or_else(|| "expected a queued MCP response".to_string())
    }

    fn close(&mut self) -> Result<(), String> {
        Ok(())
    }
}

impl McpTransportFactory for StubFactory {
    fn connect(&self, _config: &McpServerConfig) -> Result<Box<dyn McpTransport>, String> {
        Ok(Box::new(StubTransport {
            sent_messages: Arc::clone(&self.sent_messages),
            queued_responses: Arc::clone(&self.queued_responses),
        }))
    }
}

#[test]
fn sync_servers_initializes_and_lists_tools_for_enabled_stdio_servers() {
    let factory = StubFactory::with_responses(vec![
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": "2025-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "system-control", "version": "1.0.0" }
            }
        }),
        json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "tools": [
                    {
                        "name": "type_text",
                        "description": "Type text into the focused app",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "text": { "type": "string" }
                            },
                            "required": ["text"]
                        }
                    }
                ]
            }
        }),
    ]);
    let mut runtime = McpRuntime::with_factory(Box::new(factory.clone()));

    runtime
        .sync_servers(&[McpServerConfig::stdio(
            "system-control",
            "System Control",
            "fake-server",
            vec!["--stdio".to_string()],
            BTreeMap::new(),
        )])
        .expect("runtime should initialize fake stdio server");

    let tools = runtime.available_tools();
    assert_eq!(
        tools,
        vec![McpToolDescriptor {
            qualified_name: "mcp__system_control__type_text".to_string(),
            server_id: "system-control".to_string(),
            tool_name: "type_text".to_string(),
            description: "Type text into the focused app".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "text": { "type": "string" }
                },
                "required": ["text"]
            }),
        }]
    );

    let sent_messages = factory
        .sent_messages
        .lock()
        .expect("sent messages lock should succeed");
    assert_eq!(sent_messages.len(), 3);
    assert_eq!(sent_messages[0]["method"], "initialize");
    assert_eq!(sent_messages[1]["method"], "notifications/initialized");
    assert_eq!(sent_messages[2]["method"], "tools/list");
}

#[test]
fn call_tool_routes_to_matching_server_and_extracts_text_content() {
    let factory = StubFactory::with_responses(vec![
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "protocolVersion": "2025-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "system-control", "version": "1.0.0" }
            }
        }),
        json!({
            "jsonrpc": "2.0",
            "id": 2,
            "result": {
                "tools": [
                    {
                        "name": "open_url",
                        "description": "Open a browser URL",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "url": { "type": "string" }
                            },
                            "required": ["url"]
                        }
                    }
                ]
            }
        }),
        json!({
            "jsonrpc": "2.0",
            "id": 3,
            "result": {
                "content": [
                    { "type": "text", "text": "已打开链接。" }
                ],
                "isError": false
            }
        }),
    ]);
    let mut runtime = McpRuntime::with_factory(Box::new(factory.clone()));
    runtime
        .sync_servers(&[McpServerConfig::stdio(
            "system-control",
            "System Control",
            "fake-server",
            vec!["--stdio".to_string()],
            BTreeMap::new(),
        )])
        .expect("runtime should initialize fake stdio server");

    let result = runtime
        .call_tool(&McpToolCall {
            server_id: "system-control".to_string(),
            tool_name: "open_url".to_string(),
            arguments: json!({ "url": "https://www.rust-lang.org" }),
        })
        .expect("tool call should succeed");

    assert_eq!(result.display_text, "已打开链接。");

    let sent_messages = factory
        .sent_messages
        .lock()
        .expect("sent messages lock should succeed");
    assert_eq!(sent_messages[3]["method"], "tools/call");
    assert_eq!(sent_messages[3]["params"]["name"], "open_url");
    assert_eq!(
        sent_messages[3]["params"]["arguments"],
        json!({ "url": "https://www.rust-lang.org" })
    );
}
