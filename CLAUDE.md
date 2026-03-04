# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chatbox is a cross-platform desktop and mobile AI chat client built with Electron, React, and Capacitor. It supports multiple AI model providers (OpenAI, Anthropic, Google, DeepSeek, etc.) and runs on Windows, macOS, Linux, iOS, and Android.

## Development Commands

### Setup
```bash
pnpm install
```

### Development
```bash
pnpm dev                    # Start Electron app in development mode
pnpm dev:web                # Start web-only development mode
pnpm dev:local              # Start with local API (USE_LOCAL_API=true)
pnpm dev:debug              # Start with Node inspector on port 5858
```

### Building
```bash
pnpm build                  # Build all processes (main, preload, renderer)
pnpm build:web              # Build for web platform
pnpm package                # Build and package for current platform
pnpm package:all            # Build and package for all platforms (Windows, macOS, Linux)
```

### Testing
```bash
pnpm test                   # Run all unit tests
pnpm test:watch             # Run tests in watch mode
pnpm test:ui                # Run tests with Vitest UI
pnpm test:coverage          # Run tests with coverage report
pnpm test:integration       # Run integration tests (300s timeout)
pnpm test:file-conversation # Run file conversation integration tests
pnpm test:model-provider    # Run model provider integration tests
```

### Code Quality
```bash
pnpm lint                   # Lint code with Biome
pnpm lint:fix               # Lint and auto-fix issues
pnpm format                 # Format code with Biome
pnpm check                  # TypeScript type checking (no emit)
pnpm check:biome            # Run Biome checks
pnpm check:ci               # Run Biome CI checks
```

### Mobile Development
```bash
pnpm mobile:ios             # Sync and open iOS project in Xcode
pnpm mobile:android         # Sync and open Android project in Android Studio
pnpm mobile:sync            # Sync both iOS and Android
pnpm mobile:assets          # Generate mobile app assets
```

## Architecture

### Process Structure (Electron)

The application follows Electron's multi-process architecture:

- **Main Process** (`src/main/`): Node.js process managing app lifecycle, windows, IPC, and native features
  - `main.ts`: Entry point, window management, IPC setup
  - `knowledge-base/`: RAG system with vector database (libsql) for document processing
  - `mcp/`: Model Context Protocol integration for tool use
  - `file-parser.ts`: File parsing for various formats (PDF, DOCX, etc.)
  - `store-node.ts`: Persistent storage using electron-store

- **Preload Process** (`src/preload/`): Bridge between main and renderer with contextBridge API

- **Renderer Process** (`src/renderer/`): React application running in browser context
  - `index.tsx`: Application initialization, migration, and rendering
  - `router.tsx`: TanStack Router configuration
  - `routes/`: File-based routing with TanStack Router
  - `stores/`: Jotai atoms and state management
  - `packages/`: Core business logic modules
  - `components/`: React components
  - `hooks/`: Custom React hooks
  - `storage/`: Data persistence layer (SQLite for images, electron-store for settings)

- **Shared** (`src/shared/`): Code shared between all processes
  - `types/`: TypeScript type definitions (session, settings, provider)
  - `providers/`: AI model provider definitions and registry
  - `models/`: Model configurations and metadata

### Key Architectural Patterns

1. **State Management**: Uses Jotai for atomic state management
   - `stores/atoms/`: Atom definitions
   - `stores/chatStore.ts`: Chat session state
   - `stores/settingsStore.ts`: Application settings
   - `stores/migration.ts`: Data migration logic between versions

2. **AI Model Integration**: Vercel AI SDK (`ai` package) for unified model interface
   - `packages/model-calls/`: Streaming, tool use, and message handling
   - `shared/providers/`: Provider definitions (OpenAI, Anthropic, Google, etc.)
   - Supports streaming text generation, tool calling, and image generation

3. **Storage Layer**:
   - SQLite (libsql) for knowledge base vectors and image generation history
   - electron-store for settings and session data
   - IndexedDB fallback for web platform

4. **Error Handling**: Multi-layered error catching (see ERROR_HANDLING.md)
   - React Error Boundaries
   - Global window error handlers
   - Unhandled promise rejection handlers
   - Sentry integration for error reporting

5. **Build System**: electron-vite for fast Vite-based builds
   - Separate builds for main, preload, and renderer processes
   - Web build support via `CHATBOX_BUILD_PLATFORM=web`
   - Mobile builds via Capacitor

## Important Conventions

### Environment Variables
- `CHATBOX_BUILD_PLATFORM`: Target platform (web, ios, android, or undefined for desktop)
- `CHATBOX_BUILD_TARGET`: Build target (mobile_app or undefined)
- `USE_LOCAL_API`: Use local API server for development
- `NODE_ENV`: Environment (development, production, test)

### Path Aliases (tsconfig.json)
- `@/`: Maps to `src/renderer/`
- `@shared/`: Maps to `src/shared/`
- `src/`: Maps to `src/`

### Testing
- Unit tests: Co-located with source files as `*.test.ts` or `*.spec.ts`
- Integration tests: Located in `test/integration/`
- Test environment: Node.js with Vitest
- Silent mode enabled by default to reduce noise

### Code Style
- Uses Biome for linting and formatting (not ESLint/Prettier)
- TypeScript strict mode enabled
- React with TypeScript and functional components

### Model Provider System
- Providers defined in `src/shared/providers/definitions/`
- Registry pattern in `src/shared/providers/registry.ts`
- Each provider exports configuration, model list, and capabilities
- Supports custom API endpoints and authentication

### IPC Communication
- Main process exposes APIs via `contextBridge` in preload
- Renderer calls main process functions via `window.api.*`
- Type-safe IPC with TypeScript definitions in `src/shared/electron-types.ts`

### Migration System
- Version-based migrations in `src/renderer/stores/migration.ts`
- Runs on app startup before rendering
- Handles data structure changes between versions
- Shows migration progress in loading screen

## Common Development Workflows

### Adding a New AI Provider
1. Create provider definition in `src/shared/providers/definitions/`
2. Export from `src/shared/providers/index.ts`
3. Add to provider registry
4. Add model configurations if needed
5. Test with integration tests in `test/integration/model-provider/`

### Working with Sessions
- Session state managed in `src/renderer/stores/chatStore.ts`
- Session types defined in `src/shared/types/session.ts`
- Message streaming handled in `src/renderer/packages/model-calls/stream-text.ts`
- Session persistence via storage layer

### Debugging
- Main process: Use `pnpm dev:debug` and attach debugger to port 5858
- Renderer process: Use Chrome DevTools (automatically opens in dev mode)
- Check `ERROR_HANDLING.md` for error handling architecture
- Development error testing utilities available at `window.errorTestingUtils`

### Platform-Specific Code
- Use `platform.type` to detect platform (desktop, web, mobile)
- Platform abstraction in `src/renderer/platform/`
- Conditional imports for mobile features (Capacitor plugins)
- Build-time environment variables for platform detection

## Common Gotchas

1. **Storage Migration**: When modifying data schemas, update `src/renderer/stores/migration.ts` to handle version upgrades
2. **Platform-Specific Code**: Check `platform.type` (desktop/web/mobile) before using platform-specific APIs
3. **Build Targets**: Web builds exclude Electron APIs; use conditional imports
4. **Token Estimation**: Token counting is cached per message with different tokenizers (default, deepseek)
5. **MCP Integration**: MCP servers run in main process with stdio transport
6. **Sentry**: Errors are automatically reported to Sentry in production; use `Sentry.captureException()` for manual reporting

## Node Version

Requires Node.js >= 20.0.0 and < 23.0.0 (see package.json engines)
Uses pnpm >= 10.0.0 as package manager
