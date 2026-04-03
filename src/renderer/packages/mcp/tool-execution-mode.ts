import type { ToolSet } from 'ai'

export type ToolExecutionMode = 'preview' | 'execute'

type PreviewToolResult = {
  preview: true
  executed: false
  toolName: string
  args: unknown
  message: string
}

function createPreviewToolResult(toolName: string, args: unknown): PreviewToolResult {
  return {
    preview: true,
    executed: false,
    toolName,
    args,
    message: 'Tool execution deferred until the transcript is finalized.',
  }
}

export function wrapToolSetForExecutionMode(toolSet: ToolSet, executionMode: ToolExecutionMode): ToolSet {
  if (executionMode === 'execute') {
    return toolSet
  }

  const wrappedTools: ToolSet = {}
  for (const [toolName, tool] of Object.entries(toolSet)) {
    wrappedTools[toolName] = {
      ...tool,
      execute: async (args) => createPreviewToolResult(toolName, args),
    }
  }

  return wrappedTools
}
