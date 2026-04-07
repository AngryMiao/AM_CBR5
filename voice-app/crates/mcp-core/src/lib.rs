use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MCP_PROTOCOL_VERSION: &str = "2025-11-05";
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub transport: McpTransportConfig,
}

impl McpServerConfig {
    pub fn stdio(
        id: impl Into<String>,
        name: impl Into<String>,
        command: impl Into<String>,
        args: Vec<String>,
        env: BTreeMap<String, String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            enabled: true,
            transport: McpTransportConfig::Stdio {
                command: command.into(),
                args,
                env,
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpTransportConfig {
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env: BTreeMap<String, String>,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct McpToolDescriptor {
    pub qualified_name: String,
    pub server_id: String,
    pub tool_name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct McpToolCall {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpToolCallResult {
    pub display_text: String,
}

pub trait McpTransport: Send {
    fn send_json(&mut self, message: &Value) -> Result<(), String>;
    fn recv_json(&mut self) -> Result<Value, String>;
    fn close(&mut self) -> Result<(), String>;
}

pub trait McpTransportFactory: Send + Sync {
    fn connect(&self, config: &McpServerConfig) -> Result<Box<dyn McpTransport>, String>;
}

#[derive(Default)]
pub struct StdioMcpTransportFactory;

impl McpTransportFactory for StdioMcpTransportFactory {
    fn connect(&self, config: &McpServerConfig) -> Result<Box<dyn McpTransport>, String> {
        match &config.transport {
            McpTransportConfig::Stdio { command, args, env } => {
                let mut child = Command::new(command);
                child.args(args);
                child.stdin(Stdio::piped());
                child.stdout(Stdio::piped());
                child.stderr(Stdio::null());
                if !env.is_empty() {
                    child.envs(env);
                }

                let mut child = child
                    .spawn()
                    .map_err(|cause| format!("启动 MCP stdio server 失败: {cause}"))?;
                let stdin = child
                    .stdin
                    .take()
                    .ok_or_else(|| "MCP stdio server 未暴露 stdin。".to_string())?;
                let stdout = child
                    .stdout
                    .take()
                    .ok_or_else(|| "MCP stdio server 未暴露 stdout。".to_string())?;

                Ok(Box::new(StdioMcpTransport {
                    child,
                    stdin: BufWriter::new(stdin),
                    stdout: BufReader::new(stdout),
                }))
            }
        }
    }
}

pub struct McpRuntime {
    factory: Box<dyn McpTransportFactory>,
    servers: BTreeMap<String, ActiveMcpServer>,
    next_request_id: u64,
}

impl Default for McpRuntime {
    fn default() -> Self {
        Self::new()
    }
}

impl McpRuntime {
    pub fn new() -> Self {
        Self::with_factory(Box::new(StdioMcpTransportFactory))
    }

    pub fn with_factory(factory: Box<dyn McpTransportFactory>) -> Self {
        Self {
            factory,
            servers: BTreeMap::new(),
            next_request_id: 1,
        }
    }

    pub fn sync_servers(&mut self, configs: &[McpServerConfig]) -> Result<(), String> {
        self.close_all_servers();

        for config in configs.iter().filter(|config| config.enabled) {
            let mut transport = self.factory.connect(config)?;
            initialize_server(&mut *transport, self.next_request_id)?;
            self.next_request_id = self.next_request_id.saturating_add(2);

            let tools = list_tools(
                &mut *transport,
                self.next_request_id.saturating_sub(1),
                config,
            )?;
            let active_server = ActiveMcpServer { tools, transport };
            self.servers.insert(config.id.clone(), active_server);
        }

        Ok(())
    }

    pub fn available_tools(&self) -> Vec<McpToolDescriptor> {
        let mut tools = self
            .servers
            .values()
            .flat_map(|server| server.tools.clone())
            .collect::<Vec<_>>();
        tools.sort_by(|left, right| left.qualified_name.cmp(&right.qualified_name));
        tools
    }

    pub fn active_server_ids(&self) -> Vec<String> {
        self.servers.keys().cloned().collect()
    }

    pub fn call_tool(&mut self, call: &McpToolCall) -> Result<McpToolCallResult, String> {
        let server = self
            .servers
            .get_mut(&call.server_id)
            .ok_or_else(|| format!("未找到 MCP server：{}。", call.server_id))?;
        let request_id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);

        server.transport.send_json(&json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tools/call",
            "params": {
                "name": call.tool_name,
                "arguments": call.arguments,
            }
        }))?;

        let response = server.transport.recv_json()?;
        if response["id"] != json!(request_id) {
            return Err("MCP tools/call 响应 id 不匹配。".to_string());
        }

        if let Some(error_message) = response["error"]["message"].as_str() {
            return Err(format!("MCP tools/call 失败: {error_message}"));
        }

        if response["result"]["isError"].as_bool().unwrap_or(false) {
            let fallback = extract_result_text(&response["result"]["content"])
                .unwrap_or_else(|| "MCP 工具执行失败。".to_string());
            return Err(fallback);
        }

        Ok(McpToolCallResult {
            display_text: extract_result_text(&response["result"]["content"])
                .unwrap_or_else(|| "MCP 工具执行已完成。".to_string()),
        })
    }

    fn close_all_servers(&mut self) {
        for (_id, server) in self.servers.iter_mut() {
            let _ = server.transport.close();
        }
        self.servers.clear();
    }
}

impl Drop for McpRuntime {
    fn drop(&mut self) {
        self.close_all_servers();
    }
}

struct ActiveMcpServer {
    tools: Vec<McpToolDescriptor>,
    transport: Box<dyn McpTransport>,
}

struct StdioMcpTransport {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl McpTransport for StdioMcpTransport {
    fn send_json(&mut self, message: &Value) -> Result<(), String> {
        let payload = serde_json::to_string(message)
            .map_err(|cause| format!("序列化 MCP 请求失败: {cause}"))?;
        self.stdin
            .write_all(payload.as_bytes())
            .map_err(|cause| format!("写入 MCP stdin 失败: {cause}"))?;
        self.stdin
            .write_all(b"\n")
            .map_err(|cause| format!("写入 MCP stdin 换行失败: {cause}"))?;
        self.stdin
            .flush()
            .map_err(|cause| format!("刷新 MCP stdin 失败: {cause}"))
    }

    fn recv_json(&mut self) -> Result<Value, String> {
        let mut line = String::new();

        loop {
            line.clear();
            let bytes_read = self
                .stdout
                .read_line(&mut line)
                .map_err(|cause| format!("读取 MCP stdout 失败: {cause}"))?;
            if bytes_read == 0 {
                return Err("MCP stdio server 已提前关闭。".to_string());
            }

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            return serde_json::from_str::<Value>(trimmed)
                .map_err(|cause| format!("解析 MCP 响应失败: {cause}"));
        }
    }

    fn close(&mut self) -> Result<(), String> {
        if let Err(cause) = self.child.kill() {
            if cause.kind() != std::io::ErrorKind::InvalidInput {
                return Err(format!("关闭 MCP stdio server 失败: {cause}"));
            }
        }

        let _ = self.child.wait();
        Ok(())
    }
}

fn initialize_server(transport: &mut dyn McpTransport, request_id: u64) -> Result<(), String> {
    transport.send_json(&json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "initialize",
        "params": {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {
                "name": "voice-app",
                "version": "0.1.0",
            }
        }
    }))?;

    let response = transport.recv_json()?;
    if response["id"] != json!(request_id) {
        return Err("MCP initialize 响应 id 不匹配。".to_string());
    }
    if let Some(error_message) = response["error"]["message"].as_str() {
        return Err(format!("MCP initialize 失败: {error_message}"));
    }

    transport.send_json(&json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {},
    }))?;

    Ok(())
}

fn list_tools(
    transport: &mut dyn McpTransport,
    request_id: u64,
    config: &McpServerConfig,
) -> Result<Vec<McpToolDescriptor>, String> {
    transport.send_json(&json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "tools/list",
        "params": {},
    }))?;

    let response = transport.recv_json()?;
    if response["id"] != json!(request_id) {
        return Err("MCP tools/list 响应 id 不匹配。".to_string());
    }
    if let Some(error_message) = response["error"]["message"].as_str() {
        return Err(format!("MCP tools/list 失败: {error_message}"));
    }

    let tools = response["result"]["tools"]
        .as_array()
        .ok_or_else(|| "MCP tools/list 未返回合法 tools 数组。".to_string())?;

    Ok(tools
        .iter()
        .map(|tool| McpToolDescriptor {
            qualified_name: normalize_tool_name(&config.name, tool["name"].as_str().unwrap_or("")),
            server_id: config.id.clone(),
            tool_name: tool["name"].as_str().unwrap_or("").to_string(),
            description: tool["description"].as_str().unwrap_or("").to_string(),
            input_schema: tool["inputSchema"].clone(),
        })
        .collect())
}

fn normalize_tool_name(server_name: &str, tool_name: &str) -> String {
    let normalized_server_name = server_name.replace(char::is_whitespace, "_");

    if normalized_server_name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return format!(
            "mcp__{}__{tool_name}",
            normalized_server_name.to_lowercase()
        );
    }

    format!("mcp__{tool_name}")
}

fn extract_result_text(content: &Value) -> Option<String> {
    content.as_array().and_then(|items| {
        items
            .iter()
            .find(|item| item["type"].as_str() == Some("text"))
            .and_then(|item| item["text"].as_str())
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty())
    })
}
