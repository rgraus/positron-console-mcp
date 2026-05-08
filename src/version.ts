/**
 * Shared extension version — resolved once from package.json at bundle time.
 *
 * Both extension.ts (VS Code lifecycle) and server.ts (MCP server info) need
 * the current version. This module provides a single source of truth.
 *
 * We use `require` here because esbuild bundles `package.json` into the output
 * at build time. The `as string` cast is safe: `version` is always a string in
 * package.json per the npm spec.
 */
export const EXTENSION_VERSION = require("../package.json").version as string;
