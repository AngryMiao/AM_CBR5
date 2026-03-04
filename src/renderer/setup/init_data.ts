import { defaultSessionsForCN, defaultSessionsForEN } from '@/packages/initial_data'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKey, StorageKeyGenerator } from '@/storage/StoreStorage'
import * as chatStore from '@/stores/chatStore'
import { getSessionMeta } from '@/stores/sessionHelpers'
import { ModelProviderEnum } from '@shared/types'

// 内置 DeepSeek API Key（仅 demo 用途）
const BUILT_IN_DEEPSEEK_API_KEY = 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

export async function initData() {
  await initDefaultSettings()
  await initSessionsIfNeeded()
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

async function initSessionsIfNeeded() {
  // 已经做过 migration，只需要检查是否存在 sessionList
  const sessionList = await chatStore.listSessionsMeta()
  if (sessionList.length > 0) {
    return
  }

  const newSessionList = await initPresetSessions()

  await chatStore.updateSessionList(() => {
    return newSessionList
  })
}

async function initPresetSessions() {
  const lang = await platform.getLocale().catch((e) => 'en')

  const defaultSessions = lang.startsWith('zh') ? defaultSessionsForCN : defaultSessionsForEN

  for (const session of defaultSessions) {
    await storage.setItemNow(StorageKeyGenerator.session(session.id), session)
  }

  const sessionList = defaultSessions.map(getSessionMeta)

  await storage.setItemNow(StorageKey.ChatSessionsList, sessionList)

  return sessionList
}
