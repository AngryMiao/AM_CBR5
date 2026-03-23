# Angrymiao System Control Plugin

This subproject is now organized as a standalone Claude Code plugin repository.

Claude Code reads the plugin directly from the repository root:

- `.claude-plugin/plugin.json`
- `.mcp.json`
- `skills/angrymiao-voice-control/SKILL.md`
- `runtime/system-control-mcp/dist/index.js`

## What This Is

The original Chatbox bundle under `skill-bundles/angrymiao-voice-control` is Chatbox-specific. Claude Code does not read that manifest format directly.

This directory repackages the same system-control runtime and prompt instructions in Claude Code's native plugin layout so the folder can be published as an independent plugin source repository.

## What The Plugin Provides

- A plugin-scoped MCP server named `angrymiao-system-control`
- A Claude Code skill named `angrymiao-voice-control`

When the plugin is enabled, the MCP server exposes tools such as:

- `mcp__angrymiao-system-control__type_text`
- `mcp__angrymiao-system-control__keyboard_control`
- `mcp__angrymiao-system-control__open_browser`
- `mcp__angrymiao-system-control__system_lock_screen`
- `mcp__angrymiao-system-control__system_sleep`
- `mcp__angrymiao-system-control__system_restart`
- `mcp__angrymiao-system-control__system_shutdown`

The skill is available as:

```text
/angrymiao-system-control-plugin:angrymiao-voice-control
```

## Validate

If the `claude` CLI is installed, validate the plugin repository from this directory:

```bash
claude plugin validate .
```

## Publish Notes

This repository is intended to be used as a plugin source in a Claude Code marketplace entry. The marketplace can point directly at this repo as the plugin source.

## Notes

- The runtime requires `node` to be available in `PATH`.
- `keyboard_control` requires `KEYBOARD_DRIVER_PATH` to be set in Claude Code's environment.
- On macOS, text input and shortcut fallbacks may require Accessibility and Automation permissions.
