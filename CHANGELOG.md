# Changelog

## [1.0.3] - 2026-05-08

### Added

- 🖥️ MCP server auto-registration via `registerMcpServerDefinitionProvider` — appears under **Extensions → MCP SERVERS → Installed** with logo
- 🏷️ `mcpServerDefinitionProviders` contribution point in `package.json`
- 📥 Open VSX install badge in README

### Changed

- 📦 GitHub Releases now named `positron-console-mcp v*.*.*`
- 🔒 CORS restricted from `*` to localhost origins only
- 🔄 Version extracted into shared `src/version.ts` module — server and health endpoint now report correct version
- 🧹 Typed `PositronAdapter` eliminates all `as any` / `@typescript-eslint/no-explicit-any` casts in `console-service.ts`
- 📇 MCP server name aligned to `positron-console-mcp` across all files, commands, and tests
- 🗺️ Switch-case dispatch replaced with typed dispatch map — localized `ToolArgsMap` casts
- 🧪 87 tests across 4 suites, coverage: 93.7% stmts / 84.6% branches / 95.8% funcs

## [1.0.2] - 2026-05-08

### Fixed

- 🔧 GitHub Release workflow permissions added (`contents: write`) to allow attaching VSIX artifacts

## [1.0.1] - 2026-05-08

### Added

- 🎨 `"icon": "logo.png"` field in `package.json` so Open VSX displays the extension logo

## [1.0.0] - 2026-05-08

### Production Release

- 🎯 **1.0.0 release** — all core features stable, 87 tests passing, MCP protocol compliant
- 🧪 87 tests across 4 test suites (unit + HTTP integration)
- 🔒 Stateless Streamable HTTP mode with localhost-only binding
- ⚡ Port auto-retry on EADDRINUSE (base through +9)
- 🛡️ Rate limiting (120 req/min/IP) with automatic cleanup
- ⚠️ Oversized payload rejection (5 MB limit)
- 🔍 Zod-based input validation with discriminated unions per tool
- 📊 Enhanced observability: health endpoint, structured logging, status bar
- ⏱️ execute_code timeout via Promise.race, output truncation (500KB/entry, 200 entries max)

### Breaking Changes from 0.1.0

- None. All tools and interfaces remain backward-compatible.

## [0.1.0] - 2026-05-07

### Initial Release

- 🚀 MCP Streamable HTTP server with 12 tools for Positron Console automation
- 📋 Session management: `list_consoles`, `get_active_console`, `focus_console`
- ⚡ Code execution: `execute_code` with full observer lifecycle (onStarted → onOutput → onCompleted → onFinished)
- 📦 Structured output capture (MIME data maps)
- 🔍 Variable introspection: `get_session_variables`
- 🔗 Connection management: `create_connection`
- 🎨 Plot settings and console width tools
- 📝 Editor context integration
- 🌐 Viewer pane URL opening
- 🔧 Environment variable management
- 🛑 Graceful degradation in standard VS Code (no Positron API)
- 📊 Status bar item with server status and port info
- ⚙️ Commands: Console MCP: Show Status, Copy MCP Configuration, Add to .vscode/mcp.json, Restart Server
- 🔒 Localhost-only server with Host header validation
- 🧪 33 unit tests with full Positron API mocking
