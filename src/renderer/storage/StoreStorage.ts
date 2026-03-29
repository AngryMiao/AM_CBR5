import { DebouncedFunc } from 'lodash'
import debounce from 'lodash/debounce'
import { v4 as uuidv4 } from 'uuid'
import BaseStorage from './BaseStorage'

function encodeStorageSegment(value: string): string {
  return encodeURIComponent(value)
}

export enum StorageKey {
  ChatSessions = 'chat-sessions',
  Configs = 'configs',
  Settings = 'settings',
  MyCopilots = 'myCopilots',
  ConfigVersion = 'configVersion',
  RemoteConfig = 'remoteConfig',
  ChatSessionsList = 'chat-sessions-list',
  ChatSessionSettings = 'chat-session-settings',
  PictureSessionSettings = 'picture-session-settings',
  AuthInfo = 'authInfo',
}

export const StorageKeyGenerator = {
  session(id: string) {
    return `session:${id}`
  },
  picture(category: string) {
    return `picture:${category}:${uuidv4()}`
  },
  file(sessionId: string, msgId: string) {
    return `file:${sessionId}:${msgId}:${uuidv4()}`
  },
  // 链接和文件预处理需要稳定 key，才能正确复用状态与缓存。
  linkUniqKey(url: string) {
    return `link:${encodeStorageSegment(url.trim())}`
  },
  fileUniqKey(file: Pick<File, 'name' | 'size' | 'type' | 'lastModified'>) {
    return `file-uniq:${encodeStorageSegment(file.name)}:${file.size}:${encodeStorageSegment(file.type)}:${file.lastModified}`
  },
}

export default class StoreStorage extends BaseStorage {
  constructor() {
    super()
  }
  public async getItem<T>(key: string, initialValue: T): Promise<T> {
    let value: T = await super.getItem(key, initialValue)

    if (key === StorageKey.Configs && value === initialValue) {
      await super.setItemNow(key, initialValue) // 持久化初始生成的 uuid
    }

    return value
  }

  private debounceQueue = new Map<string, DebouncedFunc<(key: string, value: unknown) => void>>()

  public async setItem<T>(key: string, value: T): Promise<void> {
    let debounced = this.debounceQueue.get(key)
    if (!debounced) {
      debounced = debounce(this.setItemNow.bind(this), 500, { maxWait: 2000 })
      this.debounceQueue.set(key, debounced)
    }
    debounced(key, value)
  }
}
