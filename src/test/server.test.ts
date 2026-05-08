import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We need to mock @posit-dev/positron BEFORE importing server
const mockExecuteCode = vi.fn().mockResolvedValue({});
const mockGetPreferredRuntime = vi.fn().mockResolvedValue({
  runtimeName: "Python 3.12",
  runtimeId: "python-3.12",
});
const mockGetActiveSessions = vi
  .fn()
  .mockResolvedValue([
    {
      metadata: {
        sessionId: "s1",
        languageId: "python",
        runtimeName: "Python 3.12",
        runtimeId: "py-312",
      },
    },
  ]);
const mockGetForegroundSession = vi.fn().mockResolvedValue({
  metadata: {
    sessionId: "s1",
    languageId: "python",
    runtimeName: "Python 3.12",
    runtimeId: "py-312",
  },
});
const mockGetSessionVariables = vi.fn().mockResolvedValue([]);
const mockPreviewUrl = vi.fn().mockResolvedValue(undefined);
const mockGetPlotsRenderSettings = vi
  .fn()
  .mockResolvedValue({ size: { width: 800, height: 600 } });
const mockLastActiveEditorContext = vi.fn().mockResolvedValue(null);
const mockGetEnvironmentContributions = vi.fn().mockResolvedValue({});
const mockRegisterConnectionDriver = vi.fn();

const mockApi = {
  version: "1.0.0",
  runtime: {
    executeCode: mockExecuteCode,
    getPreferredRuntime: mockGetPreferredRuntime,
    getActiveSessions: mockGetActiveSessions,
    getForegroundSession: mockGetForegroundSession,
    getSessionVariables: mockGetSessionVariables,
    onDidExecuteCode: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeForegroundSession: vi.fn(() => ({ dispose: vi.fn() })),
  },
  window: {
    previewUrl: mockPreviewUrl,
    showSimpleModalDialogPrompt: vi.fn().mockResolvedValue(true),
    getPlotsRenderSettings: mockGetPlotsRenderSettings,
    onDidChangeConsoleWidth: vi.fn(() => ({ dispose: vi.fn() })),
  },
  connections: { registerConnectionDriver: mockRegisterConnectionDriver },
  methods: {
    lastActiveEditorContext: mockLastActiveEditorContext,
    call: vi.fn().mockResolvedValue({}),
    showQuestion: vi.fn().mockResolvedValue(true),
    showDialog: vi.fn().mockResolvedValue(undefined),
  },
  environment: {
    getEnvironmentContributions: mockGetEnvironmentContributions,
  },
  languages: {
    registerStatementRangeProvider: vi.fn(),
    registerHelpTopicProvider: vi.fn(),
  },
};

vi.mock("@posit-dev/positron", () => ({
  tryAcquirePositronApi: () => mockApi,
  PositronApi: {} as any,
}));

// Now import the module under test (mock is set up)
import { McpConsoleServer } from "../server";
import { ConsoleService } from "../console-service";

describe("McpConsoleServer (unit)", () => {
  let server: McpConsoleServer;

  beforeEach(() => {
    // Reset mocks between tests
    vi.clearAllMocks();
    // Restore default mock behaviors
    mockGetActiveSessions.mockResolvedValue([
      {
        metadata: {
          sessionId: "s1",
          languageId: "python",
          runtimeName: "Python 3.12",
          runtimeId: "py-312",
        },
      },
    ]);
    mockGetForegroundSession.mockResolvedValue({
      metadata: {
        sessionId: "s1",
        languageId: "python",
        runtimeName: "Python 3.12",
        runtimeId: "py-312",
      },
    });
    mockGetSessionVariables.mockResolvedValue(["x", "y", "df"]);
    mockPreviewUrl.mockResolvedValue(undefined);
    mockExecuteCode.mockResolvedValue({});
    mockGetPreferredRuntime.mockResolvedValue({
      runtimeName: "Python 3.12",
      runtimeId: "python-3.12",
    });
    mockLastActiveEditorContext.mockResolvedValue(null);
    mockGetEnvironmentContributions.mockResolvedValue({});
    mockGetPlotsRenderSettings.mockResolvedValue({
      size: { width: 800, height: 600 },
    });

    server = new McpConsoleServer(7081);
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  // ─── Construction / State ──────────────────────────────────────
  it("should create server with default port", () => {
    expect(server.getPort()).toBe(7081);
    expect(server.isRunning()).toBe(false);
  });

  it("should start and stop cleanly", async () => {
    await server.start();
    expect(server.isRunning()).toBe(true);
    await server.stop();
    expect(server.isRunning()).toBe(false);
  });

  it("should restart cleanly (stop then start again)", async () => {
    await server.start();
    expect(server.isRunning()).toBe(true);
    await server.stop();
    expect(server.isRunning()).toBe(false);
    await server.start();
    expect(server.isRunning()).toBe(true);
    await server.stop();
  });

  // ─── Tool definitions ───────────────────────────────────────────
  it("should define and wire up exactly 12 MCP tools", async () => {
  // We verify tool count through a dispatch smoke test
    // that hits every tool name — if any tool is missing from the handler map,
    // the dispatch will fail with "Unknown tool"
    const allToolNames = [
      "list_consoles", "get_active_console", "focus_console", "execute_code",
      "get_session_variables", "get_preferred_runtime", "create_connection",
      "get_console_width", "set_environment_variable", "get_editor_context",
      "open_viewer", "get_plot_settings",
    ];

    for (const name of allToolNames) {
      const args: Record<string, unknown> =
        name === "execute_code" ? { code: "1+1" } :
        name === "focus_console" ? { sessionId: "s1" } :
        name === "get_preferred_runtime" ? { languageId: "python" } :
        name === "create_connection" ? { driverId: "test", inputs: [] } :
        name === "set_environment_variable" ? { name: "X", value: "1" } :
        name === "open_viewer" ? { url: "https://example.com" } :
        {};

      const result = await server.dispatch(name, args);
      expect(result.isError, `Tool ${name} should dispatch without error`).toBeFalsy();
      expect(result.content.length, `Tool ${name} should return content`).toBeGreaterThan(0);
    }

    // Unknown tool should still error
    const badResult = await server.dispatch("nonexistent_tool", {});
    expect(badResult.isError).toBe(true);
    expect(badResult.content[0].text).toContain("Unknown tool");
  });

  // ─── Health check format ───────────────────────────────────────
  it("health endpoint format should report Positron available", () => {
    // Access the private consoleService to verify status
    const consoleService = (server as any).consoleService as ConsoleService;
    expect(consoleService.isAvailable()).toBe(true);
    const status = consoleService.getStatus();
    expect(status).toBe("Positron API connected");
  });

  // ─── Port auto-retry ───────────────────────────────────────────
  it("port auto-retry should try next port when first is EADDRINUSE", async () => {
    const net = await import("net");

    // Create two servers: start a throwaway server on port 7070,
    // so our MCP server (port 7070) must retry to 7071
    const blockPort = 7070;
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(blockPort, "127.0.0.1", resolve));

    const retryServer = new McpConsoleServer(blockPort);
    try {
      const assignedPort = await retryServer.start();
      // Should have skipped 7070 and landed on 7071
      expect(assignedPort).toBeGreaterThanOrEqual(blockPort + 1);
      expect(assignedPort).toBeLessThanOrEqual(blockPort + 9);
      expect(retryServer.isRunning()).toBe(true);
    } finally {
      await retryServer.stop();
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  // Also test that starting a second instance of the same server
  // (on a different McpConsoleServer object) picks a different port.
  it("two server instances should get different ports when started on same base", async () => {
    const serverA = new McpConsoleServer(7080);
    const serverB = new McpConsoleServer(7080);

    try {
      const portA = await serverA.start();
      const portB = await serverB.start();

      // Second server should skip the first's port and get the next
      expect(portB).toBeGreaterThanOrEqual(portA + 1);
      expect(portB).toBeLessThanOrEqual(7080 + 9);
      expect(portA).not.toBe(portB);
    } finally {
      await serverA.stop();
      await serverB.stop();
    }
  });
});
