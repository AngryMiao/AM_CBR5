import { v4 as uuidv4 } from 'uuid'
import { type Config, ModelProviderEnum, type SessionSettings, type Settings, Theme } from './types'

export const BUILT_IN_DEEPSEEK_API_KEY = 'sk-8bf09678b5804183b7f800f04e1421c8'
export const BUILT_IN_ALIYUN_ASR_API_KEY = 'sk-02e2c27765c248a092da9760070c8151'
export const BUILT_IN_ALIYUN_ASR_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export function defaultVoiceSettings(): NonNullable<Settings['voice']> {
  return {
    enabled: true,
    triggerMode: 'toggle',
    asrProvider: 'aliyun',
    ttsProvider: 'browser',
    asrConfig: {
      openai: {
        apiKey: BUILT_IN_ALIYUN_ASR_API_KEY,
        model: 'whisper-1',
        baseURL: BUILT_IN_ALIYUN_ASR_BASE_URL,
      },
      aliyun: {
        apiKey: BUILT_IN_ALIYUN_ASR_API_KEY,
        model: 'qwen3-asr-flash',
        baseURL: BUILT_IN_ALIYUN_ASR_BASE_URL,
        enableITN: true,
      },
    },
    ttsConfig: {},
    shortcuts: {
      toggleVoice: 'Ctrl+Shift+V',
    },
    keyboardShortcuts: [],
    autoStopRecording: true,
    silenceThreshold: 0.01,
    silenceDuration: 1500,
    maxRecordingDuration: 60000,
    autoPlayResponse: true,
    showTranscript: true,
  }
}

export function settings(): Settings {
  return {
    // aiProvider: ModelProviderEnum.OpenAI,
    // openaiKey: '',
    // apiHost: 'https://api.openai.com',
    // dalleStyle: 'vivid',
    // imageGenerateNum: 3,
    // openaiUseProxy: false,

    // azureApikey: '',
    // azureDeploymentName: '',
    // azureDeploymentNameOptions: [],
    // azureDalleDeploymentName: 'dall-e-3',
    // azureEndpoint: '',
    // azureApiVersion: '2024-05-01-preview',

    // chatglm6bUrl: '', // deprecated
    // chatglmApiKey: '',
    // chatglmModel: '',

    // model: 'gpt-4o',
    // openaiCustomModelOptions: [],
    // temperature: 0.7,
    // topP: 1,
    // // openaiMaxTokens: 0,
    // // openaiMaxContextTokens: 4000,
    // openaiMaxContextMessageCount: 20,
    // // maxContextSize: "4000",
    // // maxTokens: "2048",

    // claudeApiKey: '',
    // claudeApiHost: 'https://api.anthropic.com/v1',
    // claudeModel: 'claude-3-5-sonnet-20241022',
    // claudeApiKey: '',
    // claudeApiHost: 'https://api.anthropic.com',
    // claudeModel: 'claude-3-5-sonnet-20241022',

    // chatboxAIModel: 'chatboxai-3.5',

    // geminiAPIKey: '',
    // geminiAPIHost: 'https://generativelanguage.googleapis.com',
    // geminiModel: 'gemini-1.5-pro-latest',

    // ollamaHost: 'http://127.0.0.1:11434',
    // ollamaModel: '',

    // groqAPIKey: '',
    // groqModel: 'llama3-70b-8192',

    // deepseekAPIKey: '',
    // deepseekModel: 'deepseek-chat',

    // siliconCloudKey: '',
    // siliconCloudModel: 'Qwen/Qwen2.5-7B-Instruct',

    // lmStudioHost: 'http://127.0.0.1:1234/v1',
    // lmStudioModel: '',

    // perplexityApiKey: '',
    // perplexityModel: 'llama-3.1-sonar-large-128k-online',

    // xAIKey: '',
    // xAIModel: 'grok-beta',

    // customProviders: [],

    providers: {
      [ModelProviderEnum.DeepSeek]: {
        apiKey: BUILT_IN_DEEPSEEK_API_KEY,
      },
    },
    defaultChatModel: {
      provider: ModelProviderEnum.DeepSeek,
      model: 'deepseek-chat',
    },

    showWordCount: false,
    showTokenCount: false,
    showTokenUsed: true,
    showModelName: true,
    showMessageTimestamp: false,
    showFirstTokenLatency: false,
    userAvatarKey: '',
    defaultAssistantAvatarKey: '',
    theme: Theme.System,
    language: 'en',
    fontSize: 14,
    spellCheck: true,

    defaultPrompt: getDefaultPrompt(),

    allowReportingAndTracking: true,

    enableMarkdownRendering: true,
    enableLaTeXRendering: true,
    enableMermaidRendering: true,
    injectDefaultMetadata: true,
    autoPreviewArtifacts: false,
    autoCollapseCodeBlock: true,
    pasteLongTextAsAFile: true,

    autoGenerateTitle: true,

    autoCompaction: true,
    compactionThreshold: 0.6,

    autoLaunch: false,

    shortcuts: {
      quickToggle: 'Alt+`', // 快速切换窗口显隐的快捷键
      inputBoxFocus: 'mod+i', // 聚焦输入框的快捷键
      newChat: 'mod+n', // 新建聊天的快捷键
      newPictureChat: 'mod+shift+n', // 新建图片会话的快捷键
      sessionListNavNext: 'mod+tab', // 切换到下一个会话的快捷键
      sessionListNavPrev: 'mod+shift+tab', // 切换到上一个会话的快捷键
      sessionListNavTargetIndex: 'mod', // 会话导航的快捷键
      messageListRefreshContext: 'mod+r', // 刷新上下文的快捷键
      dialogOpenSearch: 'mod+k', // 打开搜索对话框的快捷键
      inputBoxSendMessage: 'Enter', // 发送消息的快捷键
      inputBoxSendMessageWithoutResponse: 'Ctrl+Enter', // 发送但不生成回复的快捷键
      optionNavUp: 'up', // 选项导航的快捷键
      optionNavDown: 'down', // 选项导航的快捷键
      optionSelect: 'enter', // 选项导航的快捷键
    },
    extension: {},
    mcp: {
      servers: [],
      enabledBuiltinServers: [],
    },
    voice: defaultVoiceSettings(),
  }
}

export function newConfigs(): Config {
  return { uuid: uuidv4() }
}

export function getDefaultPrompt() {
  return 'You are a helpful assistant.'
}

export function chatSessionSettings(): SessionSettings {
  return {
    provider: ModelProviderEnum.DeepSeek,
    modelId: 'deepseek-chat',
    maxContextMessageCount: Number.MAX_SAFE_INTEGER,
  }
}

export function pictureSessionSettings(): SessionSettings {
  return {
    provider: ModelProviderEnum.OpenAI,
    modelId: 'DALL-E-3',
    imageGenerateNum: 1,
    dalleStyle: 'vivid',
  }
}

// SystemProviders is now generated from the provider registry
// Re-export getSystemProviders as SystemProviders for backward compatibility
export { getSystemProviders as SystemProviders } from './providers/registry'
