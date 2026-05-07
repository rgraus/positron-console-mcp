# Changelog

## [1.0.0] - 2026-05-08

### Production Release

- 🎯 **1.0.0 release** — all core features stable, 100 tests passing, MCP protocol compliant
- 🧪 100 tests across 4 test suites (unit + HTTP integration)
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
- ⚙️ Commands: Show Status, Copy MCP Config, Add to mcp.json, Restart
- 🔒 Localhost-only server with Host header validation
- 🧪 33 unit tests with full Positron API mocking
