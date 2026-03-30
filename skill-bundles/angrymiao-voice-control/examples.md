# Angrymiao Voice Control Examples

## Text Input

- `帮我打一二三` -> `mcp__system-control__type_text("一二三")`
- `写一个邮箱地址 test@example.com` -> `mcp__system-control__type_text("test@example.com")`

## Keyboard Shortcuts

- `复制` -> call `mcp__system-control__keyboard_control` with OS-appropriate copy keyCodes
- `重做` -> on macOS use `Command + Shift + Z`; on Windows use `Ctrl + Y`
- `切换窗口` -> on macOS use `Command + Tab`; on Windows use `Alt + Tab`
- If the host app injects a user-configured shortcut mapping such as `<triggerWord> -> ["Digit1","Digit2","Digit3"]`, then an utterance containing that configured trigger word should execute the shortcut and produce `123`.

## Browser And Search

- `打开百度` -> `mcp__system-control__open_browser("https://www.baidu.com")`
- `搜索 Angry Miao` -> `mcp__system-control__open_browser("https://www.google.com/search?q=Angry%20Miao")`

## System Actions

- `锁屏` -> call `mcp__system-control__system_lock_screen` and on macOS expect the runtime to prefer `ScreenSaverEngine.app`
- `睡眠` -> call `mcp__system-control__system_sleep`
- `重启电脑` -> ask for confirmation, then call `mcp__system-control__system_restart`
- `关机` -> ask for confirmation, then call `mcp__system-control__system_shutdown`

## Disambiguation

- `打复制` should be treated as text input because the user explicitly asked to type the literal text `复制`.
- If an utterance contains a configured trigger word anywhere in the sentence, treat it as shortcut execution unless the user explicitly asks to type the literal text itself.
- If the user explicitly says they want to type the literal text, use text input even if that text also matches a configured trigger word.
- If the utterance is unclear, ask one short clarification question instead of guessing multiple actions.
