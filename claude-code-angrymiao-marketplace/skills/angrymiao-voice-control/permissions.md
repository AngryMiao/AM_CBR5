# Permissions

## macOS

The bundled `system-control` runtime needs these permissions for reliable typing and keyboard automation:

- Accessibility
- Automation -> `System Events`

Without them, `type_text` and some keyboard actions may fail.

For `system_lock_screen` on macOS:

- Preferred path: launch `/System/Library/CoreServices/ScreenSaverEngine.app`
- Fallbacks: older `CGSession -suspend` path, then simulated `Control+Command+Q`
- The shortcut fallback can fail if Accessibility or Automation permission is missing
- Newer macOS versions may no longer ship `CGSession` at the historical `Menu Extras/User.menu/...` path

## Windows

The runtime may require:

- a valid keyboard driver binary path for `keyboard_control`
- sufficient permissions for lock, sleep, restart, or shutdown actions

## Runtime Configuration

The runtime reads:

- `KEYBOARD_DRIVER_PATH`: optional absolute path to the keyboard control driver executable
