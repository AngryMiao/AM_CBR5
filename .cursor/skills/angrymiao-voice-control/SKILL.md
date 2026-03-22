---
name: angrymiao-voice-control
description: Control the user's computer through voice-command-style text using system-control MCP tools. Use when the user wants to type text, press keyboard shortcuts, open a browser page, search the web, or trigger desktop system actions like lock, sleep, restart, or shutdown. Before choosing OS-specific behavior, first identify whether the runtime environment is macOS or Windows.
---

# Angrymiao Voice Control

## Instructions

1. First determine the current OS environment from available runtime context.
2. If the environment is `macOS`, prefer Command-based shortcuts.
3. If the environment is `Windows`, prefer Ctrl / Alt-based shortcuts.
4. Map the user's utterance to exactly one action when possible.
5. Prefer direct tool calls over explanatory text.
6. Only ask follow-up questions when the intent is unclear or a destructive action needs confirmation.

## Tool Mapping

- Text input:
  Use `mcp__system-control__type_text` when the user says `打`、`输入`、`写`、`键入`、`打字` followed by content.
- Keyboard shortcuts:
  Use `mcp__system-control__keyboard_control` when the user asks for copy, paste, cut, undo, redo, select all, save, enter, backspace, tab, switch window, or escape-like actions.
- Browser and search:
  Use `mcp__system-control__open_browser` for `打开浏览器`、`打开网页`、`搜索`、`上网`.
- System actions:
  Use the matching system-control tool for shutdown, restart, lock screen, or sleep. Require confirmation for shutdown and restart.

## Default Shortcut Mapping

For `macOS`:

| Trigger words | keyCodes |
| --- | --- |
| 复制 / 拷贝 | `["110700E3","11070006","10070006","100700E3"]` |
| 粘贴 | `["110700E3","11070019","10070019","100700E3"]` |
| 剪切 | `["110700E3","1107001B","1007001B","100700E3"]` |
| 撤销 | `["110700E3","1107001D","1007001D","100700E3"]` |
| 重做 | `["110700E3","110700E1","1107001D","1007001D","100700E1","100700E3"]` |
| 全选 | `["110700E3","11070004","10070004","100700E3"]` |
| 保存 | `["110700E3","11070016","10070016","100700E3"]` |
| 回车 / 换行 | `["11070028","10070028"]` |
| 删除 / 退格 | `["1107002A","1007002A"]` |
| Tab / 制表符 | `["1107002B","1007002B"]` |
| 切换窗口 | `["110700E3","1107002B","1007002B","100700E3"]` |
| 取消 / 退出 | `["11070029","10070029"]` |

For `Windows`:

| Trigger words | keyCodes |
| --- | --- |
| 复制 / 拷贝 | `["110700E0","11070006","10070006","100700E0"]` |
| 粘贴 | `["110700E0","11070019","10070019","100700E0"]` |
| 剪切 | `["110700E0","1107001B","1007001B","100700E0"]` |
| 撤销 | `["110700E0","1107001D","1007001D","100700E0"]` |
| 重做 | `["110700E0","1107001C","1007001C","100700E0"]` |
| 全选 | `["110700E0","11070004","10070004","100700E0"]` |
| 保存 | `["110700E0","11070016","10070016","100700E0"]` |
| 回车 / 换行 | `["11070028","10070028"]` |
| 删除 / 退格 | `["1107002A","1007002A"]` |
| Tab / 制表符 | `["1107002B","1007002B"]` |
| 切换窗口 | `["110700E2","1107002B","1007002B","100700E2"]` |
| 取消 / 退出 | `["11070029","10070029"]` |

## Intent Priority

1. Text input
2. Shortcut execution
3. Browser open or search
4. System control

## Response Style

- Keep confirmations short.
- If a tool call already returns enough signal, avoid extra text.
- On failure, explain the concrete reason briefly.

## Examples

- `输入你好世界` -> call `mcp__system-control__type_text`
- `复制` -> call `mcp__system-control__keyboard_control`
- `搜索天气预报` -> call `mcp__system-control__open_browser`
- `锁屏` -> call `mcp__system-control__system_lock_screen`

## Additional Resources

- For sample utterances and edge cases, see [examples.md](examples.md)
