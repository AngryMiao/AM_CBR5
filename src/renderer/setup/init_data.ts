import storage from '@/storage'
import { StorageKey } from '@/storage/StoreStorage'
import { ensureAngrymiaoSession } from '@/packages/voice/angrymiao-session'
import { ModelProviderEnum } from '@shared/types'

// 内置 DeepSeek API Key（仅 demo 用途）
const BUILT_IN_DEEPSEEK_API_KEY = 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

export async function initData() {
  await initDefaultSettings()
  await ensureAngrymiaoSession({ purgeOthers: true })
}

async function initDefaultSettings() {
  if (!BUILT_IN_DEEPSEEK_API_KEY) return

  // 只在 settings 完全未设置时注入（全新安装）
  const existing = await storage.getItem<any>(StorageKey.Settings, null)
  if (existing && Object.keys(existing).length > 0) return

  const defaultSettings = {
    providers: {
      [ModelProviderEnum.DeepSeek]: {
        apiKey: BUILT_IN_DEEPSEEK_API_KEY,
      },
    },
  }
  await storage.setItemNow(StorageKey.Settings, defaultSettings)

  // 将 DeepSeek deepseek-chat 设为全局默认对话模型
  const defaultSessionSettings = {
    provider: ModelProviderEnum.DeepSeek,
    modelId: 'deepseek-chat',
  }
  await storage.setItemNow(StorageKey.ChatSessionSettings, defaultSessionSettings)
}

