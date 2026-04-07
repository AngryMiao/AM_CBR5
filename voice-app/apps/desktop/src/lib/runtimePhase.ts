import type { RuntimePhase } from './tauri'

export type RuntimePhaseTone =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'thinking'
  | 'executing'
  | 'inserting'
  | 'done'
  | 'error'
  | 'loading'

export function getRuntimePhaseTone(phase: RuntimePhase | string): RuntimePhaseTone {
  switch (phase) {
    case '待命中':
      return 'idle'
    case '正在聆听':
      return 'listening'
    case '正在识别':
      return 'processing'
    case '正在生成':
      return 'thinking'
    case '正在执行':
      return 'executing'
    case '正在输出':
      return 'inserting'
    case '已完成':
      return 'done'
    case '识别失败':
      return 'error'
    default:
      return 'loading'
  }
}
