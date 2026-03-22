# Permissions

## macOS

The bundled `system-control` runtime needs these permissions for reliable typing and keyboard automation:

- Accessibility
- Automation -> `System Events`

Without them, `type_text` and some keyboard actions may fail. Chatbox should prompt the user to grant these permissions before using the skill.

## Windows

The bundled `system-control` runtime may require:

- a valid keyboard driver binary path for `keyboard_control`
- sufficient permissions for lock, sleep, restart, or shutdown actions

## Runtime Configuration

The runtime accepts:

- `KEYBOARD_DRIVER_PATH`: optional absolute path to the keyboard control driver executable
