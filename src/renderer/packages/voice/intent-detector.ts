export type IntentType = 'input' | 'chat'

export interface Intent {
  type: IntentType
  confidence: number
}

/**
 * 疑问词列表
 */
const QUESTION_WORDS = [
  '什么',
  '怎么',
  '为什么',
  '如何',
  '哪',
  '谁',
  '几',
  '多少',
  '吗',
  '呢',
  '？',
  '?',
  '帮忙',
  '帮助',
  '请',
  '能否',
  '可以',
  '是不是',
  '有没有',
  '能不能',
  '会不会',
  '应该',
  '建议',
  '怎么办',
  '怎样',
  '为啥',
  '干嘛',
  '干啥',
]

/**
 * 判断用户意图
 * 1. 判断是否为对话意图（疑问词）
 * 2. 默认为输入意图
 */
export function determineIntent(text: string): Intent {
  const trimmedText = text.trim().toLowerCase()

  // 1. 判断是否为对话意图
  if (isConversationIntent(trimmedText)) {
    return {
      type: 'chat',
      confidence: 0.9,
    }
  }

  // 2. 默认为输入意图
  return {
    type: 'input',
    confidence: 0.8,
  }
}

/**
 * 判断是否为对话意图
 * 包含疑问词、疑问句特征
 */
export function isConversationIntent(text: string): boolean {
  const lowerText = text.toLowerCase()

  return QUESTION_WORDS.some((word) => lowerText.includes(word.toLowerCase()))
}
