mod system_prompt;

use automation_core::ToolExecutionRequest;
use mcp_core::{McpToolCall, McpToolDescriptor};
use serde::Serialize;
use settings_core::StoredVoiceSettings;
use url::Url;

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-4o-mini";
const DEFAULT_SYSTEM_PROMPT: &str =
    "你是一个桌面语音助手。用户明确要求执行本地动作时，请优先调用已提供工具；只有在不需要执行动作时，才返回简洁、可执行的最终回答。";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OpenAiCompatibleLlmConfig {
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    pub system_prompt: String,
}

impl Default for OpenAiCompatibleLlmConfig {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_string(),
            api_key: None,
            model: DEFAULT_MODEL.to_string(),
            system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
        }
    }
}

impl OpenAiCompatibleLlmConfig {
    pub fn from_settings(settings: &StoredVoiceSettings) -> Self {
        let mut config = Self::default();

        if let Some(value) = non_empty(settings.llm_base_url.as_str()) {
            config.base_url = value;
        }
        config.api_key = non_empty(settings.llm_api_key.as_str());
        if let Some(value) = non_empty(settings.llm_model.as_str()) {
            config.model = value;
        }
        if let Some(value) = non_empty(settings.llm_system_prompt.as_str()) {
            config.system_prompt = value;
        }
        config.system_prompt =
            system_prompt::resolve_system_prompt(settings, &config.system_prompt, "", None, None);

        config
    }

    pub fn from_settings_for_turn(
        settings: &StoredVoiceSettings,
        current_turn_user_text: &str,
        skill_prompt_template: Option<&str>,
        hid_reference: Option<&str>,
    ) -> Self {
        let mut config = Self::default();

        if let Some(value) = non_empty(settings.llm_base_url.as_str()) {
            config.base_url = value;
        }
        config.api_key = non_empty(settings.llm_api_key.as_str());
        if let Some(value) = non_empty(settings.llm_model.as_str()) {
            config.model = value;
        }
        if let Some(value) = non_empty(settings.llm_system_prompt.as_str()) {
            config.system_prompt = value;
        }
        config.system_prompt = system_prompt::resolve_system_prompt(
            settings,
            &config.system_prompt,
            current_turn_user_text,
            skill_prompt_template,
            hid_reference,
        );

        config
    }

    pub fn runtime_config(&self) -> OpenAiCompatibleLlmRuntimeConfig {
        OpenAiCompatibleLlmRuntimeConfig {
            provider: "openai-compatible".to_string(),
            model: self.model.clone(),
            base_url: self.base_url.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OpenAiCompatibleLlmRuntimeConfig {
    pub provider: String,
    pub model: String,
    pub base_url: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LlmGenerationOutcome {
    pub text: String,
    pub tool_requests: Vec<LlmToolRequest>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum LlmToolRequest {
    Local(ToolExecutionRequest),
    Mcp(McpToolCall),
}

#[derive(Clone, Debug)]
pub struct OpenAiCompatibleLlmService {
    client: reqwest::blocking::Client,
    config: OpenAiCompatibleLlmConfig,
}

impl OpenAiCompatibleLlmService {
    pub fn new(config: OpenAiCompatibleLlmConfig) -> Self {
        Self {
            client: reqwest::blocking::Client::builder()
                .http1_title_case_headers()
                .build()
                .expect("llm http client should build"),
            config,
        }
    }

    pub fn runtime_config(&self) -> OpenAiCompatibleLlmRuntimeConfig {
        self.config.runtime_config()
    }

    #[cfg(test)]
    pub fn system_prompt_for_test(&self) -> &str {
        &self.config.system_prompt
    }

    pub fn validate_config(&self) -> Result<(), String> {
        validate_config(&self.config)
    }

    pub fn generate(&self, transcript: &str) -> Result<LlmGenerationOutcome, String> {
        self.generate_with_mcp_tools(transcript, &[])
    }

    pub fn generate_with_mcp_tools(
        &self,
        transcript: &str,
        mcp_tools: &[McpToolDescriptor],
    ) -> Result<LlmGenerationOutcome, String> {
        self.validate_config()?;

        let transcript = transcript.trim();
        if transcript.is_empty() {
            return Err("未收到可用于生成的识别文本。".to_string());
        }

        let api_key = self
            .config
            .api_key
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "LLM API Key 未配置。".to_string())?;

        let response = self
            .client
            .post(build_chat_completions_url(&self.config.base_url))
            .bearer_auth(api_key)
            .json(&ChatCompletionsRequest {
                model: self.config.model.clone(),
                messages: vec![
                    ChatMessage {
                        role: "system".to_string(),
                        content: self.config.system_prompt.clone(),
                    },
                    ChatMessage {
                        role: "user".to_string(),
                        content: format!("用户说：{transcript}"),
                    },
                ],
                tools: tool_definitions(mcp_tools),
                tool_choice: "auto".to_string(),
            })
            .send()
            .map_err(|cause| format!("OpenAI-compatible LLM 请求失败: {cause}"))?
            .error_for_status()
            .map_err(|cause| format!("OpenAI-compatible LLM 请求失败: {cause}"))?;

        let payload = response
            .json::<ChatCompletionsResponse>()
            .map_err(|cause| format!("OpenAI-compatible LLM 响应解析失败: {cause}"))?;
        let message = payload
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message)
            .ok_or_else(|| "LLM 返回空结果".to_string())?;
        let text = message.content.unwrap_or_default().trim().to_string();
        let tool_requests = message
            .tool_calls
            .into_iter()
            .map(|call| parse_tool_call(call, mcp_tools))
            .collect::<Result<Vec<_>, _>>()?;

        if text.is_empty() && tool_requests.is_empty() {
            return Err("LLM 返回空结果".to_string());
        }

        Ok(LlmGenerationOutcome {
            text,
            tool_requests,
        })
    }
}

#[derive(Serialize)]
struct ChatCompletionsRequest {
    model: String,
    messages: Vec<ChatMessage>,
    tools: Vec<ChatToolDefinition>,
    tool_choice: String,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct ChatCompletionsResponse {
    choices: Vec<ChatChoice>,
}

#[derive(serde::Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(serde::Deserialize)]
struct ChatMessageResponse {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<ChatToolCallResponse>,
}

#[derive(Serialize)]
struct ChatToolDefinition {
    #[serde(rename = "type")]
    kind: &'static str,
    function: ChatFunctionDefinition,
}

#[derive(Serialize)]
struct ChatFunctionDefinition {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct ChatToolCallResponse {
    function: ChatToolFunctionResponse,
}

#[derive(serde::Deserialize)]
struct ChatToolFunctionResponse {
    name: String,
    arguments: String,
}

#[derive(serde::Deserialize)]
struct TypeTextArguments {
    text: String,
}

#[derive(serde::Deserialize)]
struct OpenUrlArguments {
    url: String,
}

fn build_chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();

    if value.is_empty() {
        return None;
    }

    Some(value.to_string())
}

fn tool_definitions(mcp_tools: &[McpToolDescriptor]) -> Vec<ChatToolDefinition> {
    let mut tools = vec![
        ChatToolDefinition {
            kind: "function",
            function: ChatFunctionDefinition {
                name: "type_text".to_string(),
                description: "把文字输出到当前系统焦点输入位置。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "要输出到当前输入焦点的文字内容。"
                        }
                    },
                    "required": ["text"],
                    "additionalProperties": false
                }),
            },
        },
        ChatToolDefinition {
            kind: "function",
            function: ChatFunctionDefinition {
                name: "open_url".to_string(),
                description: "在系统默认浏览器中打开一个 http:// 或 https:// 链接。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "要打开的链接地址。"
                        }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }),
            },
        },
    ];

    tools.extend(mcp_tools.iter().map(|tool| ChatToolDefinition {
        kind: "function",
        function: ChatFunctionDefinition {
            name: tool.qualified_name.clone(),
            description: tool.description.clone(),
            parameters: tool.input_schema.clone(),
        },
    }));

    tools
}

fn parse_tool_call(
    call: ChatToolCallResponse,
    mcp_tools: &[McpToolDescriptor],
) -> Result<LlmToolRequest, String> {
    let request = match call.function.name.as_str() {
        "type_text" => {
            let args = serde_json::from_str::<TypeTextArguments>(&call.function.arguments)
                .map_err(|cause| format!("LLM 工具参数解析失败: {cause}"))?;
            LlmToolRequest::Local(ToolExecutionRequest::type_text(args.text))
        }
        "open_url" => {
            let args = serde_json::from_str::<OpenUrlArguments>(&call.function.arguments)
                .map_err(|cause| format!("LLM 工具参数解析失败: {cause}"))?;
            LlmToolRequest::Local(ToolExecutionRequest::open_url(args.url))
        }
        other => {
            let tool = mcp_tools
                .iter()
                .find(|tool| tool.qualified_name == other)
                .ok_or_else(|| format!("LLM 返回了不支持的工具：{other}"))?;
            let arguments = serde_json::from_str(&call.function.arguments)
                .map_err(|cause| format!("LLM 工具参数解析失败: {cause}"))?;

            LlmToolRequest::Mcp(McpToolCall {
                server_id: tool.server_id.clone(),
                tool_name: tool.tool_name.clone(),
                arguments,
            })
        }
    };

    if let LlmToolRequest::Local(request) = &request {
        request.validate()?;
    }

    Ok(request)
}

fn validate_config(config: &OpenAiCompatibleLlmConfig) -> Result<(), String> {
    let base_url = config.base_url.trim();
    if base_url.is_empty() {
        return Err("LLM Base URL 未配置。".to_string());
    }

    let parsed_url = Url::parse(base_url)
        .map_err(|_| "LLM Base URL 必须是合法的 http:// 或 https:// 地址。".to_string())?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err("LLM Base URL 必须是合法的 http:// 或 https:// 地址。".to_string());
    }

    if config.model.trim().is_empty() {
        return Err("LLM 模型未配置。".to_string());
    }

    let api_key = config
        .api_key
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());

    if api_key.is_none() {
        return Err("LLM API Key 未配置。".to_string());
    }

    Ok(())
}
