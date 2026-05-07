import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpConsoleServer } from "../server";

/**
 * HTTP-level integration tests for the MCP server.
 * These tests spin up a real Express server and make real HTTP requests via Node.js fetch.
 * They complement the unit-level dispatch tests in server.test.ts.
 */
describe("McpConsoleServer (HTTP integration)", () => {
  let server: McpConsoleServer;
  let baseUrl: string;

  beforeAll(
    async () => {
      server = new McpConsoleServer(6090);
      const port = await server.start();
      baseUrl = `http://127.0.0.1:${port}`;
    },
    15000
  );

  afterAll(
    async () => {
      await server.stop();
    },
    5000
  );

  // ── Helper ──────────────────────────────────────────────────────
  async function fetchJson(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; headers: Headers; body: unknown }> {
    const url = `${baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        Host: new URL(baseUrl).host,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      signal: AbortSignal.timeout(5000),
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") ?? "";
    let parsed: unknown;
    if (contentType.includes("application/json")) {
      parsed = await res.json();
    } else {
      parsed = await res.text();
    }
    return { status: res.status, headers: res.headers, body: parsed };
  }

  // ── Health endpoint ─────────────────────────────────────────────
  it(
    "GET /health should return status ok",
    async () => {
      const res = await fetchJson("GET", "/health");
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).status).toBe("ok");
      expect((res.body as Record<string, unknown>).service).toBe("positron-console-automatization");
    },
    10000
  );

  // ── Logo endpoint ──────────────────────────────────────────────
  it(
    "GET /logo should return SVG content",
    async () => {
      const res = await fetchJson("GET", "/logo");
      expect(res.status).toBe(200);
      // Using fetch, content-type is a string from get()
      const contentType = res.headers.get("content-type") ?? "";
      expect(contentType).toContain("image/svg+xml");
    },
    10000
  );

  // ── MCP GET (405) ──────────────────────────────────────────────
  it(
    "GET /mcp should return 405 in stateless mode",
    async () => {
      const res = await fetchJson("GET", "/mcp");
      expect(res.status).toBe(405);
      const allow = res.headers.get("allow") ?? "";
      expect(allow).toContain("POST");
      expect(allow).toContain("DELETE");
      expect((res.body as Record<string, unknown>).error).toContain("GET not supported");
    },
    10000
  );

  // ── MCP DELETE (204) ──────────────────────────────────────────
  it(
    "DELETE /mcp should return 204",
    async () => {
      const res = await fetchJson("DELETE", "/mcp");
      expect(res.status).toBe(204);
    },
    10000
  );

  // ── CORS preflight ──────────────────────────────────────────────
  it(
    "OPTIONS /mcp should return CORS headers",
    async () => {
      const res = await fetchJson("OPTIONS", "/mcp");
      expect(res.status).toBe(204);
      const acao = res.headers.get("access-control-allow-origin") ?? "";
      expect(acao).toBe("*");
    },
    10000
  );

  // ── MCP: tools/list ────────────────────────────────────────────
  it(
    "POST /mcp with tools/list should return tool definitions",
    async () => {
      const res = await fetchJson("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.result).toBeDefined();
      const tools = (body.result as { tools: unknown[] }).tools;
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(12);
      for (const tool of tools) {
        const t = tool as Record<string, unknown>;
        expect(t.name).toBeDefined();
        expect(t.title || typeof t.description === "string").toBeTruthy();
        expect(t.inputSchema).toBeDefined();
      }
    },
    10000
  );

  // ── MCP: tools/call (list_consoles) ─────────────────────────────
  it(
    "POST /mcp with tools/call should execute list_consoles",
    async () => {
      const res = await fetchJson("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_consoles", arguments: {} },
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.result).toBeDefined();
      const result = (body.result as { content: { type: string; text: string }[] }).content;
      expect(result[0].type).toBe("text");
      const parsed = JSON.parse(result[0].text);
      // Graceful: when Positron API is available, expect consoles list;
      // otherwise expect a graceful error message
      if (parsed.consoles) {
        expect(typeof parsed.count).toBe("number");
      } else {
        expect(parsed.error).toBeDefined();
      }
    },
    10000
  );

  // ── MCP: tools/call (execute_code — no session, should error) ──
  it(
    "POST /mcp execute_code without session should return error",
    async () => {
      const res = await fetchJson("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "execute_code", arguments: { code: "1+1" } },
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.result).toBeDefined();
      const content = (body.result as { content: { type: string; text: string }[] }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.error).toBeDefined();
    },
    10000
  );

  // ── MCP: tools/call with invalid tool name ──────────────────────
  it(
    "POST /mcp with unknown tool name should return error",
    async () => {
      const res = await fetchJson("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "nonexistent", arguments: {} },
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      const result = body.result as { isError: boolean; content: { type: string; text: string }[] } | undefined;
      expect(result?.isError).toBe(true);
      expect(result?.content[0].text).toContain("Unknown tool");
    },
    10000
  );

  // ── JSON parse error ────────────────────────────────────────────
  it(
    "POST /mcp with invalid JSON should return error",
    async () => {
      const url = `${baseUrl}/mcp`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Host: new URL(baseUrl).host,
          "Content-Type": "application/json",
        },
        body: "not valid json {{{",
        signal: AbortSignal.timeout(5000),
      });
      expect(res.status).toBe(400);
    },
    10000
  );

  // ── Body too large ──────────────────────────────────────────────
  it(
    "POST /mcp with oversized payload should be rejected",
    async () => {
      const largeCode = "x".repeat(6_000_000);
      const res = await fetchJson("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "execute_code", arguments: { code: largeCode } },
      });
      expect(res.status === 413 || res.status === 400).toBe(true);
    },
    15000
  );

  // ── MCP: invalid JSON-RPC method ────────────────────────────────
  it(
    "POST /mcp with invalid JSON-RPC method should be handled gracefully",
    async () => {
      const res = await fetchJson("POST", "/mcp", {
        jsonrpc: "2.0",
        id: 6,
        method: "invalid/method",
        params: {},
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.error || body.result).toBeDefined();
    },
    10000
  );
});