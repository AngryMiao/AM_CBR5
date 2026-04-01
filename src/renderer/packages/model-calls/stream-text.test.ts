import type { ModelInterface } from '@shared/models/types'
import type { Message } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getSessionMock,
  resolveAgentSkillPromptMock,
  convertToModelMessagesMock,
  injectPromptMock,
  injectModelSystemPromptMock,
  getAvailableToolsMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  resolveAgentSkillPromptMock: vi.fn(),
  convertToModelMessagesMock: vi.fn(),
  injectPromptMock: vi.fn(),
  injectModelSystemPromptMock: vi.fn(),
  getAvailableToolsMock: vi.fn(),
}))

vi.mock('@/stores/chatStore', () => ({
  getSession: getSessionMock,
}))

vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      getSettings: () => ({
        voice: {
          keyboardShortcuts: [
            {
              id: 'shortcut-1',
              triggerWords: ['自定义触发词'],
              recordedKeys: ['Digit1', 'Digit2', 'Digit3'],
              keyCodes: [],
              enabled: true,
            },
          ],
        },
      }),
    }),
  },
}))

vi.mock('../agent-skills', () => ({
  resolveAgentSkillPrompt: resolveAgentSkillPromptMock,
}))

vi.mock('../mcp/controller', () => ({
  mcpController: {
    getAvailableTools: getAvailableToolsMock,
  },
}))

vi.mock('./message-utils', () => ({
  convertToModelMessages: convertToModelMessagesMock,
  injectPrompt: injectPromptMock,
  injectModelSystemPrompt: injectModelSystemPromptMock,
}))

vi.mock('./toolsets/file', () => ({
  default: {
    description: '',
    tools: {},
  },
}))

vi.mock('@/stores/settingActions', () => ({}))

import { streamText } from './stream-text'

function createTextMessage(id: string, role: Message['role'], text: string): Message {
  return {
    id,
    role,
    contentParts: [{ type: 'text', text }],
  }
}

describe('streamText', () => {
  beforeEach(() => {
    getSessionMock.mockReset()
    resolveAgentSkillPromptMock.mockReset()
    convertToModelMessagesMock.mockReset()
    injectPromptMock.mockReset()
    injectModelSystemPromptMock.mockReset()
    getAvailableToolsMock.mockReset()

    resolveAgentSkillPromptMock.mockResolvedValue('skill prompt')
    injectPromptMock.mockImplementation((messages) => messages)
    injectModelSystemPromptMock.mockImplementation((_modelId, messages) => messages)
    convertToModelMessagesMock.mockResolvedValue([])
    getAvailableToolsMock.mockReturnValue({})
  })

  it('passes the latest user utterance into the skill prompt resolver', async () => {
    const modelChatMock = vi.fn().mockResolvedValue({ contentParts: [] })
    const model: ModelInterface = {
      name: 'Mock Model',
      modelId: 'mock-model',
      isSupportVision: () => true,
      isSupportToolUse: () => true,
      isSupportSystemMessage: () => true,
      chat: modelChatMock,
      paint: vi.fn(),
    }

    const skillReference = {
      id: 'angrymiao-voice-control',
      bundleId: 'angrymiao-voice-control',
    }
    getSessionMock.mockResolvedValue({
      id: 'session-1',
      messages: [],
      agentSkill: skillReference,
    })

    const messages: Message[] = [
      createTextMessage('user-1', 'user', '前一轮消息'),
      createTextMessage('assistant-1', 'assistant', '上一轮回复'),
      createTextMessage('user-2', 'user', '帮我输出自定义触发词'),
    ]

    await streamText(model, {
      sessionId: 'session-1',
      messages,
      onResultChangeWithCancel: vi.fn(),
    })

    expect(resolveAgentSkillPromptMock).toHaveBeenCalledWith(
      skillReference,
      expect.objectContaining({
        keyboardShortcuts: expect.any(Array),
      }),
      '帮我输出自定义触发词'
    )
  })
})
