import { z } from 'zod'

export function getDefaultFunASRLaunchCommand(
  platform = typeof process !== 'undefined' ? process.platform : undefined
) {
  return platform === 'win32' ? 'python' : 'python3'
}

// 语音模式状态
export const VoiceModeSchema = z.enum(['inactive', 'listening', 'processing', 'speaking'])
export type VoiceMode = z.infer<typeof VoiceModeSchema>

// 语音触发方式
export const VoiceTriggerModeSchema = z.enum(['toggle', 'hold'])
export type VoiceTriggerMode = z.infer<typeof VoiceTriggerModeSchema>

// ASR (Automatic Speech Recognition) 提供商
export const ASRProviderSchema = z.enum(['whisper-local', 'funasr-local', 'openai', 'aliyun', 'azure', 'google'])
export type ASRProvider = z.infer<typeof ASRProviderSchema>

// TTS (Text-to-Speech) 提供商
export const TTSProviderSchema = z.enum(['browser', 'openai', 'azure', 'elevenlabs'])
export type TTSProvider = z.infer<typeof TTSProviderSchema>

// Whisper 本地模型大小
export const WhisperModelSizeSchema = z.enum(['tiny', 'base', 'small', 'medium'])
export type WhisperModelSize = z.infer<typeof WhisperModelSizeSchema>

// ASR 配置
export const ASRConfigSchema = z.object({
  funasrLocal: z
    .object({
      baseURL: z.string().default('http://127.0.0.1:10095'),
      model: z.string().default('paraformer-zh-streaming'),
      language: z.string().default('zh'),
      autoStart: z.boolean().default(true),
      launchCommand: z.string().default(getDefaultFunASRLaunchCommand()),
      launchArgs: z.string().default('-m funasr_server --port 10095'),
      launchCwd: z.string().optional(),
      healthPaths: z.array(z.string()).default(['/health', '/status']),
      transcribePaths: z.array(z.string()).default(['/transcribe', '/asr']),
      responseTextPaths: z.array(z.string()).default(['text', 'result', 'data.text', 'data.result']),
      requestTemplate: z
        .object({
          fileField: z.string().default('file'),
          modelField: z.string().default('model'),
          languageField: z.string().default('language'),
          vadField: z.string().default('enable_vad'),
          punctuationField: z.string().default('enable_punctuation'),
          hotwordsField: z.string().default('hotwords'),
        })
        .default({
          fileField: 'file',
          modelField: 'model',
          languageField: 'language',
          vadField: 'enable_vad',
          punctuationField: 'enable_punctuation',
          hotwordsField: 'hotwords',
        }),
      enableVAD: z.boolean().default(true),
      enablePunctuation: z.boolean().default(true),
      hotwords: z.array(z.string()).default([]),
      timeoutMs: z.number().min(1000).max(120000).default(30000),
    })
    .optional(),
  whisperLocal: z
    .object({
      modelSize: WhisperModelSizeSchema.default('base'),
      language: z.string().optional(),
      remoteHost: z.string().optional(), // 自定义模型下载镜像，如 https://hf-mirror.com
      localModelPath: z.string().optional(), // 本地模型路径（绝对路径）
    })
    .optional(),
  openai: z
    .object({
      apiKey: z.string(),
      model: z.string().default('whisper-1'),
      baseURL: z.string().optional(),
    })
    .optional(),
  aliyun: z
    .object({
      apiKey: z.string(),
      model: z.string().default('qwen3-asr-flash'),
      baseURL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
      language: z.string().optional(),
      enableITN: z.boolean().default(false),
    })
    .optional(),
  azure: z
    .object({
      apiKey: z.string(),
      endpoint: z.string(),
      region: z.string(),
    })
    .optional(),
  google: z
    .object({
      apiKey: z.string(),
      languageCode: z.string().default('zh-CN'),
    })
    .optional(),
})
export type ASRConfig = z.infer<typeof ASRConfigSchema>

// TTS 配置
export const TTSConfigSchema = z.object({
  browser: z
    .object({
      voice: z.string().optional(), // 语音名称，如 'Microsoft Huihui - Chinese (Simplified, PRC)'
      rate: z.number().min(0.1).max(10).default(1), // 语速
      pitch: z.number().min(0).max(2).default(1), // 音调
      volume: z.number().min(0).max(1).default(1), // 音量
    })
    .optional(),
  openai: z
    .object({
      apiKey: z.string(),
      model: z.string().default('tts-1'),
      voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('alloy'),
      speed: z.number().min(0.25).max(4.0).default(1.0),
      baseURL: z.string().optional(),
    })
    .optional(),
  azure: z
    .object({
      apiKey: z.string(),
      endpoint: z.string(),
      voice: z.string().default('zh-CN-XiaoxiaoNeural'), // Azure 语音名称
      region: z.string(),
    })
    .optional(),
  elevenlabs: z
    .object({
      apiKey: z.string(),
      voiceId: z.string(),
      modelId: z.string().default('eleven_multilingual_v2'),
    })
    .optional(),
})
export type TTSConfig = z.infer<typeof TTSConfigSchema>

// 键盘快捷键映射条目
export const KeyboardShortcutSchema = z.object({
  id: z.string(),
  name: z.string(), // 显示名，如 "复制"
  triggerWords: z.array(z.string()), // 语音触发词，如 ["复制", "拷贝"]
  keyCodes: z.array(z.string()), // hex key codes，如 ["110700E0","11070006","10070006","100700E0"]
  enabled: z.boolean().default(true),
})
export type KeyboardShortcut = z.infer<typeof KeyboardShortcutSchema>

// 快捷键配置
export const VoiceShortcutsSchema = z.object({
  toggleVoice: z.string().default('Ctrl+Shift+V'), // 切换语音模式
  stopSpeaking: z.string().optional(), // 停止播放语音
})
export type VoiceShortcuts = z.infer<typeof VoiceShortcutsSchema>

// 语音设置
export const VoiceSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  triggerMode: VoiceTriggerModeSchema.default('toggle'),
  asrProvider: ASRProviderSchema.default('whisper-local'),
  ttsProvider: TTSProviderSchema.default('browser'),
  asrConfig: ASRConfigSchema.default({}),
  ttsConfig: TTSConfigSchema.default({}),
  shortcuts: VoiceShortcutsSchema.default({ toggleVoice: 'Ctrl+Shift+V' }),
  keyboardDriverPath: z.string().optional(), // driver.exe 的完整路径
  keyboardShortcuts: z.array(KeyboardShortcutSchema).default([]), // 键盘快捷键映射表
  autoStopRecording: z.boolean().default(true), // 检测到静音后自动停止录音
  silenceThreshold: z.number().min(0).max(0.2).default(0.02), // 静音阈值
  silenceDuration: z.number().min(500).max(10000).default(3000), // 静音持续时间（毫秒）
  maxRecordingDuration: z.number().min(10000).max(300000).default(60000), // 最大录音时长（毫秒）
  autoPlayResponse: z.boolean().default(true), // 自动播放 LLM 响应
  showTranscript: z.boolean().default(true), // 显示实时转录文本
})
export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>

// 语音消息元数据
export const VoiceMessageMetadataSchema = z.object({
  isVoiceInput: z.boolean().default(false), // 是否通过语音输入
  asrProvider: ASRProviderSchema.optional(), // 使用的 ASR 提供商
  transcriptionDuration: z.number().optional(), // 转录耗时（毫秒）
  audioDuration: z.number().optional(), // 音频时长（毫秒）
  isVoiceOutput: z.boolean().default(false), // 是否通过语音输出
  ttsProvider: TTSProviderSchema.optional(), // 使用的 TTS 提供商
  ttsDuration: z.number().optional(), // TTS 生成耗时（毫秒）
})
export type VoiceMessageMetadata = z.infer<typeof VoiceMessageMetadataSchema>
