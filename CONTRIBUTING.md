# Contributing to Positron Console MCP

Thanks for your interest in contributing! This document outlines the development workflow, code standards, and testing practices for this project.

## Prerequisites

- **Node.js** 18, 20, or 22
- **npm** 9+
- **Visual Studio Code** 1.100+ (or **Positron** 2025.06+)

## Getting Started

```bash
git clone https://github.com/davidrsch/positron-console-mcp.git
cd positron-console-mcp
npm ci
```

### Verify your setup

```bash
npm run build    # Bundle with esbuild
npm run lint     # ESLint
npm test         # Vitest
npx tsc --noEmit # Type-check
```

## Project Structure

```
src/
├── extension.ts        # VS Code / Positron extension activation
├── server.ts           # MCP Streamable HTTP server (stateless) + Express routes
├── console-service.ts  # Business logic wrapping @posit-dev/positron API
├── validation.ts       # Zod schemas for tool argument validation
├── types.ts            # Shared TypeScript type definitions
└── test/
    ├── server.test.ts              # MCP server unit tests (SDK mocking)
    ├── server.integration.test.ts  # Full HTTP integration tests (superwstest)
    ├── console-service.test.ts     # ConsoleService unit tests
    └── validation.test.ts          # Validation schema tests
```

## Development Workflow

1. Create a feature branch from `main`.
2. Make your changes.
3. Run the full quality pipeline locally:

   ```bash
   npm run lint
   npx tsc --noEmit
   npm test
   npm run build
   ```

4. Push and open a Pull Request against `main`. GitHub Actions will run the CI
   workflow (lint + type-check + test) across Node 18, 20, and 22.

## Code Standards

### TypeScript

- **strict mode** enabled in `tsconfig.json`
- Avoid `any` — use `unknown` or properly narrow types
- Document public APIs with JSDoc
- Run `npm run lint` before committing

### Testing

- All new tools require tests in `src/test/`
- Write **unit tests** for ConsoleService methods (mock Positron API)
- Write **integration tests** for server endpoints (full HTTP via superwstest)
- Write **validation tests** for Zod schema correctness
- Aim for meaningful coverage — happy paths, error paths, missing API scenarios

### Architecture: Stateless Streamable HTTP

This MCP server uses the **Streamable HTTP** transport (spec 2025-03-26) in **stateless** mode.
Each request is handled independently — no session state is stored on the server.
This keeps the implementation simple and avoids the complexity of session management
at the transport layer, while the Positron runtime itself maintains the actual Console
session state.

- Server creates a new `McpServer` for each request in `createServerPerRequest()`
- `TransportContext` is used via `getTransportContext()` for request metadata
- Rate limiting and payload validation are applied per-request via Express middleware

### MCP Tool Conventions

- All tools use `JSON.stringify(... , null, 2)` for structured output
- Errors propagate as JSON `{ error: "..." }` objects
- Status codes: use `isError: true` on the MCP response for failures

## CI/CD

CI runs on every push/PR to `main` and validates:

| Step       | Command                            |
| ---------- | ---------------------------------- |
| Lint       | `npx eslint src/ --max-warnings 0` |
| Type-check | `npx tsc --noEmit`                 |
| Tests      | `npx vitest run`                   |

Publishing to the Open VSX Registry is handled automatically when a version
tag (e.g., `v1.0.0`) is pushed. The `build-vsix` job packages the extension with
`vsce package`. The `publish-open-vsx` job uses the official [Eclipse `ovsx` CLI]
(https://github.com/eclipse-openvsx/openvsx/tree/master/cli) to publish the
pre-built VSIX artifact (`ovsx publish *.vsix --skip-duplicate`).

Requires the `OVSX_PAT` repository secret (generate from
[open-vsx.org](https://open-vsx.org/user-settings/tokens)).

## Commit Guidelines

- Use clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commits focused and atomic

## Questions?

Open an issue on the [GitHub repository](https://github.com/davidrsch/positron-console-mcp).
