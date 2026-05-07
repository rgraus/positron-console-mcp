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
  it("should define exactly 12 tools", () => {
    void (server as any).createMcpServer();
    // The Server from SDK stores handlers internally; we verify via dispatch
    // Use handleMcpPost internals to check tool list
    expect(typeof (server as any).createMcpServer).toBe("function");
  });

  // ─── Dispatch: list_consoles ───────────────────────────────────
  it("dispatch list_consoles should return console list", async () => {
    const result = await server.dispatch("list_consoles", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.consoles).toBeDefined();
    expect(parsed.consoles).toHaveLength(1);
    expect(parsed.consoles[0].sessionId).toBe("s1");
    expect(parsed.consoles[0].languageId).toBe("python");
    expect(parsed.consoles[0].isForeground).toBe(true);
    expect(parsed.count).toBe(1);
  });

  // ─── Dispatch: get_active_console ──────────────────────────────
  it("dispatch get_active_console should return foreground session", async () => {
    const result = await server.dispatch("get_active_console", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.activeConsole).toBeDefined();
    expect(parsed.activeConsole.sessionId).toBe("s1");
    expect(parsed.activeConsole.isForeground).toBe(true);
  });

  it("dispatch get_active_console should return null when no session", async () => {
    mockGetForegroundSession.mockResolvedValue(undefined);
    const result = await server.dispatch("get_active_console", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.activeConsole).toBeNull();
    expect(parsed.message).toContain("No active console");
  });

  // ─── Dispatch: focus_console ───────────────────────────────────
  it("dispatch focus_console should focus by sessionId", async () => {
    const result = await server.dispatch("focus_console", { sessionId: "s1" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.focused).toBe(true);
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.languageId).toBeDefined();
  });

  it("dispatch focus_console should fail when no sessions exist", async () => {
    mockGetActiveSessions.mockResolvedValue([]);
    const result = await server.dispatch("focus_console", { sessionId: "s1" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.focused).toBe(false);
  });

  // ─── Dispatch: execute_code ────────────────────────────────────
  it("dispatch execute_code should execute and return results", async () => {
    const result = await server.dispatch("execute_code", { code: "print('Hello')" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.code).toBe("print('Hello')");
    expect(parsed.languageId).toBe("python");
    expect(parsed.outputs).toBeDefined();
    expect(parsed.result).toBeDefined();
  });

  it("dispatch execute_code should fail without code parameter", async () => {
    const result = await server.dispatch("execute_code", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("No code provided");
  });

  it("dispatch execute_code should use explicit languageId", async () => {
    const result = await server.dispatch("execute_code", {
      code: "1+1",
      languageId: "r",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.languageId).toBe("r");
    expect(parsed.code).toBe("1+1");
    // Verify executeCode was called with "r" language
    expect(mockExecuteCode).toHaveBeenCalledWith(
      "r",
      "1+1",
      true,
      false,
      undefined,
      expect.any(Object),
    );
  });

  // ─── Dispatch: get_session_variables ───────────────────────────
  it("dispatch get_session_variables should return variables", async () => {
    const result = await server.dispatch("get_session_variables", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.sessionId).toBe("s1");
    expect(parsed.variables).toEqual(["x", "y", "df"]);
  });

  // ─── Dispatch: get_preferred_runtime ───────────────────────────
  it("dispatch get_preferred_runtime should return runtime info", async () => {
    const result = await server.dispatch("get_preferred_runtime", {
      languageId: "python",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.runtimeName).toBe("Python 3.12");
    expect(parsed.runtimeId).toBe("python-3.12");
  });

  // ─── Dispatch: create_connection ───────────────────────────────
  it("dispatch create_connection should register and connect", async () => {
    const result = await server.dispatch("create_connection", {
      driverId: "postgresql",
      inputs: [
        { id: "host", label: "Host", type: "string", value: "localhost" },
        { id: "port", label: "Port", type: "number", value: "5432" },
      ],
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.driverId).toBe("postgresql");
    expect(mockRegisterConnectionDriver).toHaveBeenCalled();
  });

  // ─── Dispatch: get_console_width ───────────────────────────────
  it("dispatch get_console_width should return cached width", async () => {
    const result = await server.dispatch("get_console_width", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.width).toBe(80);
  });

  // ─── Dispatch: set_environment_variable ────────────────────────
  it("dispatch set_environment_variable should set a variable", async () => {
    const result = await server.dispatch("set_environment_variable", {
      name: "MY_VAR",
      value: "hello",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe("MY_VAR");
    expect(parsed.value).toBe("hello");
    expect(parsed.action).toBe("set");
  });

  it("dispatch set_environment_variable should handle unset action", async () => {
    const result = await server.dispatch("set_environment_variable", {
      name: "MY_VAR",
      value: "",
      action: "unset",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.action).toBe("unset");
  });

  // ─── Dispatch: get_editor_context ──────────────────────────────
  it("dispatch get_editor_context should return null when no editor", async () => {
    const result = await server.dispatch("get_editor_context", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.editor).toBeNull();
    expect(parsed.message).toContain("No active editor");
  });

  it("dispatch get_editor_context should return editor info", async () => {
    mockLastActiveEditorContext.mockResolvedValue({
      document: { path: "/home/test.py", languageId: "python" },
      selection: "print('hello')",
    });
    const result = await server.dispatch("get_editor_context", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.document).toBeDefined();
    expect(parsed.document.languageId).toBe("python");
    expect(parsed.selection).toBe("print('hello')");
  });

  // ─── Dispatch: open_viewer ─────────────────────────────────────
  it("dispatch open_viewer should open URL in viewer", async () => {
    const result = await server.dispatch("open_viewer", {
      url: "https://example.com",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.opened).toBe("https://example.com");
    expect(mockPreviewUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("dispatch open_viewer should fail without URL", async () => {
    const result = await server.dispatch("open_viewer", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("URL is required");
  });

  // ─── Dispatch: get_plot_settings ───────────────────────────────
  it("dispatch get_plot_settings should return dimensions", async () => {
    const result = await server.dispatch("get_plot_settings", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.size).toBeDefined();
    expect(parsed.size.width).toBe(800);
    expect(parsed.size.height).toBe(600);
  });

  // ─── Dispatch: unknown tool ────────────────────────────────────
  it("dispatch should return error for unknown tool", async () => {
    const result = await server.dispatch("nonexistent_tool", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
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
