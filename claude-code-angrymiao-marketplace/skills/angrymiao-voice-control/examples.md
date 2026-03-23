# Angrymiao Voice Control Examples

## Text Input

- `type hello world` -> `mcp__angrymiao-system-control__type_text("hello world")`
- `帮我打一二三` -> `mcp__angrymiao-system-control__type_text("一二三")`

## Keyboard Shortcuts

- `copy` -> call `mcp__angrymiao-system-control__keyboard_control` with OS-appropriate copy keyCodes
- `重做` -> on macOS use `Command + Shift + Z`; on Windows use `Ctrl + Y`
- `切换窗口` -> on macOS use `Command + Tab`; on Windows use `Alt + Tab`

## Browser And Search

- `open baidu` -> `mcp__angrymiao-system-control__open_browser("https://www.baidu.com")`
- `搜索 Angry Miao` -> `mcp__angrymiao-system-control__open_browser("https://www.google.com/search?q=Angry%20Miao")`

## System Actions

- `lock screen` -> call `mcp__angrymiao-system-control__system_lock_screen`
- `锁屏` -> call `mcp__angrymiao-system-control__system_lock_screen` and on macOS expect the runtime to prefer `ScreenSaverEngine.app`
- `睡眠` -> call `mcp__angrymiao-system-control__system_sleep`
- `重启电脑` -> ask for confirmation, then call `mcp__angrymiao-system-control__system_restart`
- `关机` -> ask for confirmation, then call `mcp__angrymiao-system-control__system_shutdown`
