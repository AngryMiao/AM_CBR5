---
name: angrymiao-voice-control
description: Use when the user wants to control their computer with natural language by typing text, pressing shortcuts, opening browser pages, or triggering lock, sleep, restart, or shutdown actions.
---

# Angrymiao Voice Control

Use the bundled MCP server `angrymiao-system-control` for desktop control tasks.

## Instructions

1. First determine the current OS environment from available runtime context.
2. If the environment is `macOS`, prefer Command-based shortcuts.
3. If the environment is `Windows`, prefer Ctrl / Alt-based shortcuts.
4. Map the user's utterance to exactly one action when possible.
5. Prefer direct tool calls over explanatory text.
6. Only ask follow-up questions when the intent is unclear or a destructive action needs confirmation.

## Tool Mapping

- Text input:
  Use `mcp__angrymiao-system-control__type_text` when the user says `type`, `enter`, `input`, `write`, `打`, `输入`, `写`, `键入`, or `打字` followed by content.
- Keyboard shortcuts:
  Use `mcp__angrymiao-system-control__keyboard_control` when the user asks for copy, paste, cut, undo, redo, select all, save, enter, backspace, tab, switch window, or escape-like actions.
- Browser and search:
  Use `mcp__angrymiao-system-control__open_browser` for `open browser`, `open webpage`, `search`, `打开浏览器`, `打开网页`, `搜索`, or `上网`.
- System actions:
  Use the matching `mcp__angrymiao-system-control__system_*` tool for shutdown, restart, lock screen, or sleep. Require confirmation for shutdown and restart.
  On macOS, prefer the bundled lock-screen implementation over simulated shortcuts; simulated `Control+Command+Q` fallback may require Accessibility or Automation permission.

## Default Shortcut Mapping

For `macOS`:

| Trigger words | keyCodes |
| --- | --- |
| copy / 复制 / 拷贝 | `["110700E3","11070006","10070006","100700E3"]` |
| paste / 粘贴 | `["110700E3","11070019","10070019","100700E3"]` |
| cut / 剪切 | `["110700E3","1107001B","1007001B","100700E3"]` |
| undo / 撤销 | `["110700E3","1107001D","1007001D","100700E3"]` |
| redo / 重做 | `["110700E3","110700E1","1107001D","1007001D","100700E1","100700E3"]` |
| select all / 全选 | `["110700E3","11070004","10070004","100700E3"]` |
| save / 保存 | `["110700E3","11070016","10070016","100700E3"]` |
| enter / 回车 / 换行 | `["11070028","10070028"]` |
| backspace / delete / 删除 / 退格 | `["1107002A","1007002A"]` |
| tab / 制表符 | `["1107002B","1007002B"]` |
| switch window / 切换窗口 | `["110700E3","1107002B","1007002B","100700E3"]` |
| escape / cancel / 取消 / 退出 | `["11070029","10070029"]` |

For `Windows`:

| Trigger words | keyCodes |
| --- | --- |
| copy / 复制 / 拷贝 | `["110700E0","11070006","10070006","100700E0"]` |
| paste / 粘贴 | `["110700E0","11070019","10070019","100700E0"]` |
| cut / 剪切 | `["110700E0","1107001B","1007001B","100700E0"]` |
| undo / 撤销 | `["110700E0","1107001D","1007001D","100700E0"]` |
| redo / 重做 | `["110700E0","1107001C","1007001C","100700E0"]` |
| select all / 全选 | `["110700E0","11070004","10070004","100700E0"]` |
| save / 保存 | `["110700E0","11070016","10070016","100700E0"]` |
| enter / 回车 / 换行 | `["11070028","10070028"]` |
| backspace / delete / 删除 / 退格 | `["1107002A","1007002A"]` |
| tab / 制表符 | `["1107002B","1007002B"]` |
| switch window / 切换窗口 | `["110700E2","1107002B","1007002B","100700E2"]` |
| escape / cancel / 取消 / 退出 | `["11070029","10070029"]` |

## Intent Priority

1. Text input
2. Shortcut execution
3. Browser open or search
4. System control

## Response Style

- Keep confirmations short.
- If a tool call already returns enough signal, avoid extra text.
- On failure, explain the concrete reason briefly.
- If macOS lock-screen fails, mention whether it looks like a removed system path or a missing permission issue.

## Supporting Files

- See `examples.md` for sample utterances.
- See `permissions.md` for macOS and Windows permission notes.
