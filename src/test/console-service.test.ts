import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConsoleService } from "../console-service";

// ─── Shared mock state via vi.hoisted ──────────────────────────
// vi.hoisted variables are accessible both inside vi.mock factory (which is hoisted)
// and in the test body below.
const mockState = vi.hoisted(() => ({
  /** Set to false to simulate Positron API unavailable */
  apiAvailable: true,
  /** Mock API object whose methods can be reconfigured per test */
  api: {
    version: "1.0.0",
    runtime: {
      executeCode: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({}),
      getPreferredRuntime: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        runtimeName: "Python 3.12",
        runtimeId: "python-3.12",
      }),
      getActiveSessions: vi.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]),
      getForegroundSession: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined),
      getSessionVariables: vi.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]),
      onDidExecuteCode: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeForegroundSession: vi.fn(() => ({ dispose: vi.fn() })),
    },
    window: {
      previewUrl: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined),
      showSimpleModalDialogPrompt: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(true),
      getPlotsRenderSettings: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
        size: { width: 800, height: 600 },
      }),
      onDidChangeConsoleWidth: vi.fn(() => ({ dispose: vi.fn() })),
    },
    connections: {
      registerConnectionDriver: vi.fn(),
    },
    methods: {
      lastActiveEditorContext: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null),
      call: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({}),
      showQuestion: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(true),
      showDialog: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(undefined),
    },
    environment: {
      getEnvironmentContributions: vi.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({}),
    },
    languages: {
      registerStatementRangeProvider: vi.fn(),
      registerHelpTopicProvider: vi.fn(),
    },
  },
}));

// Hoisted mock: vitest moves this call to the top automatically
vi.mock("@posit-dev/positron", () => ({
  tryAcquirePositronApi: vi.fn(() => (mockState.apiAvailable ? mockState.api : null)),
  PositronApi: {} as any,
}));

// ─── Helper to get a typed reference to the mock API ───────────
function mockApi() {
  return mockState.api;
}

describe("ConsoleService", () => {
  let service: ConsoleService;

  beforeEach(() => {
    // Reset: API available, all default resolves
    mockState.apiAvailable = true;
    vi.clearAllMocks();

    // Restore default resolved values that clearAllMocks wipes
    const a = mockState.api;
    a.runtime.executeCode.mockResolvedValue({});
    a.runtime.getPreferredRuntime.mockResolvedValue({
      runtimeName: "Python 3.12",
      runtimeId: "python-3.12",
    });
    a.runtime.getActiveSessions.mockResolvedValue([]);
    a.runtime.getForegroundSession.mockResolvedValue(undefined);
    a.runtime.getSessionVariables.mockResolvedValue([]);
    a.window.previewUrl.mockResolvedValue(undefined);
    a.window.showSimpleModalDialogPrompt.mockResolvedValue(true);
    a.window.getPlotsRenderSettings.mockResolvedValue({ size: { width: 800, height: 600 } });
    a.methods.lastActiveEditorContext.mockResolvedValue(null);
    a.methods.call.mockResolvedValue({});
    a.methods.showQuestion.mockResolvedValue(true);
    a.methods.showDialog.mockResolvedValue(undefined);
    a.environment.getEnvironmentContributions.mockResolvedValue({});

    service = new ConsoleService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── Availability ─────────────────────────────────────────────

  it("should report Positron API as available when mock is injected", () => {
    expect(service.isAvailable()).toBe(true);
    expect(service.getStatus()).toContain("Positron API connected");
  });

  it("should report Positron API as unavailable when tryAcquirePositronApi returns null", () => {
    mockState.apiAvailable = false;
    const nullService = new ConsoleService();
    expect(nullService.isAvailable()).toBe(false);
    expect(nullService.getStatus()).toContain("not available");
  });

  // ─── list_consoles ────────────────────────────────────────────

  it("list_consoles should return empty list when no sessions exist", async () => {
    const result = await service.listConsoles();
    const parsed = JSON.parse(result);
    expect(parsed.consoles).toEqual([]);
    expect(parsed.count).toBe(0);
  });

  it("list_consoles should enumerate sessions and mark foreground", async () => {
    const api = mockApi();
    api.runtime.getActiveSessions.mockResolvedValue([
      {
        metadata: {
          sessionId: "sess-1",
          languageId: "python",
          runtimeName: "Python 3.12",
          runtimeId: "python-3.12",
        },
      },
      {
        metadata: {
          sessionId: "sess-2",
          languageId: "r",
          runtimeName: "R 4.3",
          runtimeId: "r-4.3",
        },
      },
    ]);
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: { sessionId: "sess-2" },
    });

    const result = await service.listConsoles();
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(2);
    expect(parsed.consoles[0].isForeground).toBe(false);
    expect(parsed.consoles[1].isForeground).toBe(true);
    expect(parsed.consoles[0].languageId).toBe("python");
    expect(parsed.consoles[1].languageId).toBe("r");
  });

  // ─── get_active_console ───────────────────────────────────────

  it("get_active_console should return null when no session exists", async () => {
    const result = await service.getActiveConsole();
    const parsed = JSON.parse(result);
    expect(parsed.activeConsole).toBeNull();
    expect(parsed.message).toContain("No active console");
  });

  it("get_active_console should return foreground session info", async () => {
    const api = mockApi();
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: {
        sessionId: "sess-abc",
        languageId: "r",
        runtimeName: "R 4.3",
        runtimeId: "r-4.3",
      },
    });

    const result = await service.getActiveConsole();
    const parsed = JSON.parse(result);
    expect(parsed.activeConsole).not.toBeNull();
    expect(parsed.activeConsole.sessionId).toBe("sess-abc");
    expect(parsed.activeConsole.languageId).toBe("r");
    expect(parsed.activeConsole.isForeground).toBe(true);
  });

  // ─── focus_console ────────────────────────────────────────────

  it("focus_console should report error when neither sessionId nor index provided", async () => {
    const result = await service.focusConsole({});
    const parsed = JSON.parse(result);
    expect(parsed.focused).toBe(false);
    expect(parsed.error).toContain("sessionId or index must be provided");
  });

  it("focus_console by sessionId should call executeCode with focus:true", async () => {
    const api = mockApi();
    api.runtime.getActiveSessions.mockResolvedValue([
      {
        metadata: {
          sessionId: "sess-1",
          languageId: "python",
          runtimeName: "Python 3.12",
          runtimeId: "python-3.12",
        },
      },
    ]);

    const result = await service.focusConsole({ sessionId: "sess-1" });
    const parsed = JSON.parse(result);
    expect(parsed.focused).toBe(true);
    expect(parsed.sessionId).toBe("sess-1");
    expect(api.runtime.executeCode).toHaveBeenCalledWith(
      "python",
      "",
      true,
      false,
      "sess-1",
      expect.any(Object)
    );
  });

  it("focus_console by index should look up session and focus", async () => {
    const api = mockApi();
    api.runtime.getActiveSessions.mockResolvedValue([
      { metadata: { sessionId: "sess-a" } },
      { metadata: { sessionId: "sess-b" } },
    ]);

    const result = await service.focusConsole({ index: 1 });
    const parsed = JSON.parse(result);
    expect(parsed.focused).toBe(true);
    expect(parsed.sessionId).toBe("sess-b");
  });

  it("focus_console by out-of-range index should report error", async () => {
    const api = mockApi();
    api.runtime.getActiveSessions.mockResolvedValue([
      { metadata: { sessionId: "sess-a" } },
    ]);

    const result = await service.focusConsole({ index: 5 });
    const parsed = JSON.parse(result);
    expect(parsed.focused).toBe(false);
    expect(parsed.error).toContain("out of range");
  });

  // ─── execute_code ─────────────────────────────────────────────

  it("execute_code should reject empty code", async () => {
    const result = await service.executeCode({ code: "   " });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("No code provided");
  });

  it("execute_code should resolve language from foreground session when not provided", async () => {
    const api = mockApi();
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: { sessionId: "sess-1", languageId: "python" },
    });

    const result = await service.executeCode({ code: "print(1+1)" });
    const parsed = JSON.parse(result);
    expect(parsed.languageId).toBe("python");
    expect(parsed.code).toBe("print(1+1)");
  });

  it("execute_code should report error when no session and no languageId", async () => {
    const result = await service.executeCode({ code: "1+1" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("No active console session");
  });

  it("execute_code should invoke onStarted, onOutput, onCompleted, onFinished observers", async () => {
    const api = mockApi();

    api.runtime.executeCode.mockImplementation(
      async (
        _language: string,
        _code: string,
        _focus: boolean,
        _allowIncomplete: boolean,
        _sessionId: string | undefined,
        observer: {
          onStarted?: () => void;
          onOutput?: (msg: string) => void;
          onError?: (err: string) => void;
          onCompleted?: (res: Record<string, unknown>) => void;
          onFinished?: () => void;
        }
      ) => {
        observer.onStarted?.();
        observer.onOutput?.("Hello World");
        observer.onCompleted?.({ mimeType: "text/plain" });
        observer.onFinished?.();
        return { exitStatus: 0 };
      }
    );

    const result = await service.executeCode({
      code: "print('Hello World')",
      languageId: "python",
    });
    const parsed = JSON.parse(result);

    expect(parsed.outputs).toHaveLength(4);
    expect(parsed.outputs[0]).toEqual({ type: "status", text: "Execution started" });
    expect(parsed.outputs[1]).toEqual({ type: "output", text: "Hello World" });
    expect(parsed.outputs[2]).toEqual({ type: "status", text: "Execution completed" });
    expect(parsed.outputs[3]).toEqual({ type: "status", text: "Execution finished" });
    expect(parsed.result).toBeDefined();
  });

  it("execute_code should capture onError output", async () => {
    const api = mockApi();

    api.runtime.executeCode.mockImplementation(
      async (
        _l: string,
        _c: string,
        _f: boolean,
        _a: boolean,
        _s: string | undefined,
        observer: { onError?: (e: string) => void; onFinished?: () => void }
      ) => {
        observer.onError?.("SyntaxError: invalid syntax");
        observer.onFinished?.();
        return {};
      }
    );

    const result = await service.executeCode({
      code: "bad code",
      languageId: "python",
    });
    const parsed = JSON.parse(result);

    expect(parsed.outputs).toHaveLength(2);
    expect(parsed.outputs[0]).toEqual({ type: "error", text: "SyntaxError: invalid syntax" });
    expect(parsed.outputs[1]).toEqual({ type: "status", text: "Execution finished" });
  });

  it("execute_code should catch thrown errors from executeCode", async () => {
    const api = mockApi();
    api.runtime.executeCode.mockRejectedValue(new Error("Runtime crashed"));

    const result = await service.executeCode({
      code: "crash()",
      languageId: "python",
    });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("Runtime crashed");
  });

  // ─── get_session_variables ────────────────────────────────────

  it("get_session_variables should fall back to foreground session", async () => {
    const api = mockApi();
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: { sessionId: "fg-session" },
    });
    api.runtime.getSessionVariables.mockResolvedValue(["x", "y", "df"]);

    const result = await service.getSessionVariables({});
    const parsed = JSON.parse(result);
    expect(parsed.sessionId).toBe("fg-session");
    expect(parsed.variables).toEqual(["x", "y", "df"]);
  });

  it("get_session_variables should error when no session available", async () => {
    const result = await service.getSessionVariables({});
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("No active console session");
  });

  // ─── get_preferred_runtime ────────────────────────────────────

  it("get_preferred_runtime should return runtime info", async () => {
    const result = await service.getPreferredRuntime({ languageId: "python" });
    const parsed = JSON.parse(result);
    expect(parsed.runtimeName).toBe("Python 3.12");
    expect(parsed.runtimeId).toBe("python-3.12");
  });

  it("get_preferred_runtime should error without languageId", async () => {
    const result = await service.getPreferredRuntime({} as any);
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("languageId is required");
  });

  // ─── create_connection ────────────────────────────────────────

  it("create_connection should register driver", async () => {
    const api = mockApi();

    const result = await service.createConnection({
      driverId: "postgres",
      name: "My DB",
      inputs: [{ id: "host", label: "Host", type: "string", value: "localhost" } as any],
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(api.connections.registerConnectionDriver).toHaveBeenCalled();
  });

  it("create_connection should error without driverId", async () => {
    const result = await service.createConnection({ inputs: [] } as any);
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("driverId is required");
  });

  // ─── get_console_width ────────────────────────────────────────

  it("get_console_width should return default width", () => {
    const result = service.getConsoleWidth();
    const parsed = JSON.parse(result);
    expect(parsed.width).toBe(80);
  });

  // ─── set_environment_variable ─────────────────────────────────

  it("set_environment_variable should set a variable", async () => {
    const api = mockApi();
    api.environment.getEnvironmentContributions.mockResolvedValue({});

    const result = await service.setEnvironmentVariable({
      name: "MY_VAR",
      value: "hello",
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("set");
  });

  it("set_environment_variable should unset a variable", async () => {
    const api = mockApi();
    api.environment.getEnvironmentContributions.mockResolvedValue({
      OLD_VAR: "remove-me",
    });

    const result = await service.setEnvironmentVariable({
      name: "OLD_VAR",
      value: "",
      action: "unset",
    });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe("unset");
  });

  // ─── get_editor_context ───────────────────────────────────────

  it("get_editor_context should return null when no editor", async () => {
    const result = await service.getEditorContext();
    const parsed = JSON.parse(result);
    expect(parsed.editor).toBeNull();
  });

  it("get_editor_context should return document path and selection", async () => {
    const api = mockApi();
    api.methods.lastActiveEditorContext.mockResolvedValue({
      document: { path: "/home/test.py", languageId: "python" },
      selection: "print('hello')",
    });

    const result = await service.getEditorContext();
    const parsed = JSON.parse(result);
    expect(parsed.document.path).toBe("/home/test.py");
    expect(parsed.document.languageId).toBe("python");
    expect(parsed.selection).toBe("print('hello')");
  });

  // ─── open_viewer ──────────────────────────────────────────────

  it("open_viewer should call previewUrl", async () => {
    const api = mockApi();

    const result = await service.openViewer({ url: "https://example.com" });
    const parsed = JSON.parse(result);
    expect(parsed.opened).toBe("https://example.com");
    expect(api.window.previewUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("open_viewer should error without url", async () => {
    const result = await service.openViewer({} as any);
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("URL is required");
  });

  // ─── get_plot_settings ────────────────────────────────────────

  it("get_plot_settings should return dimensions", async () => {
    const result = await service.getPlotSettings();
    const parsed = JSON.parse(result);
    expect(parsed.size).toEqual({ width: 800, height: 600 });
  });

  // ─── dispatch ─────────────────────────────────────────────────

  it("dispatch should route to correct method", async () => {
    const result = await service.dispatch("get_console_width", {});
    expect(result.content[0].type).toBe("text");
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.width).toBe(80);
  });

  it("dispatch should return error for unknown tool", async () => {
    const result = await service.dispatch("nonexistent_tool", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });

  // ─── Graceful degradation when API unavailable ────────────────

  it("dispatch should return error when Positron API is not available", async () => {
    mockState.apiAvailable = false;
    const nullService = new ConsoleService();

    const result = await nullService.dispatch("list_consoles", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available");
  });

  // All 12 tools should return clear "not available" errors when
  // running in standard VS Code without the Positron runtime API.
  it("should return not-available error for all 12 tools when API unavailable", async () => {
    mockState.apiAvailable = false;
    const nullService = new ConsoleService();

    const tools = [
      { name: "list_consoles", args: {} },
      { name: "get_active_console", args: {} },
      { name: "focus_console", args: { sessionId: "abc" } },
      { name: "execute_code", args: { code: "1+1" } },
      { name: "get_session_variables", args: {} },
      { name: "get_preferred_runtime", args: { languageId: "python" } },
      { name: "create_connection", args: { driverId: "pg", inputs: [] } },
      { name: "get_console_width", args: {} },
      { name: "set_environment_variable", args: { name: "X", value: "1" } },
      { name: "get_editor_context", args: {} },
      { name: "open_viewer", args: { url: "https://example.com" } },
      { name: "get_plot_settings", args: {} },
    ];

    for (const tool of tools) {
      const result = await nullService.dispatch(tool.name, tool.args);
      expect(
        result.isError,
        `${tool.name} should report error when API unavailable`
      ).toBe(true);
      expect(
        result.content[0].text,
        `${tool.name} should mention "not available"`
      ).toMatch(/not available|requires Positron IDE/i);
    }
  });

  // ─── execute_code timeout test ─────────────────────────────────

  it("execute_code should timeout when execution exceeds timeoutMs", async () => {
    const api = mockApi();

    // Simulate a long-running execution that never resolves
    let resolveExecution: ((v: unknown) => void) | undefined;
    api.runtime.executeCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecution = resolve;
        })
    );

    // Set foreground session so language resolution works
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: {
        sessionId: "s1",
        languageId: "python",
        runtimeName: "Python 3.12",
        runtimeId: "py-312",
      },
    });

    const result = await service.dispatch("execute_code", {
      code: "while True: pass",
      timeoutMs: 100, // short timeout for test
    });

    // Should have timed out — error should mention timeout
    // (isError may be false if the dispatch catches it and returns content,
    //  but the content should still contain the timeout error)
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error || parsed.timedOut).toBeTruthy();
    expect(result.content[0].text).toMatch(/timed out/i);

    // Clean up the pending promise to avoid unhandled rejection warnings
    if (resolveExecution) {
      resolveExecution({});
    }
  });

  it("execute_code should truncate large output per entry", async () => {
    const api = mockApi();
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: {
        sessionId: "s1",
        languageId: "python",
        runtimeName: "Python 3.12",
        runtimeId: "py-312",
      },
    });

    // Simulate executeCode calling onOutput with a huge string
    const bigString = "x".repeat(600_000); // > 500KB limit
    api.runtime.executeCode.mockImplementation(
      (_lang: any, _code: any, _focus: any, _incomplete: any, _sid: any, observer: any) => {
        observer.onStarted();
        observer.onOutput(bigString);
        observer.onOutput("small output");
        observer.onCompleted({ mimeTypes: ["text/plain"] });
        observer.onFinished();
        return Promise.resolve({});
      }
    );

    const result = await service.dispatch("execute_code", { code: "x" });
    const parsed = JSON.parse(result.content[0].text);

    // First output should be truncated
    expect(parsed.outputs[1]?.text).toContain("[truncated");
    expect(parsed.outputs[1]?.truncated).toBe(true);
    // Second output should NOT be truncated
    expect(parsed.outputs[2]?.text).toBe("small output");
    // MIME type summary should be present
    expect(parsed.mimeTypes).toEqual(["text/plain"]);
  });

  it("execute_code should cap total number of output entries", async () => {
    const api = mockApi();
    api.runtime.getForegroundSession.mockResolvedValue({
      metadata: {
        sessionId: "s1",
        languageId: "python",
        runtimeName: "Python 3.12",
        runtimeId: "py-312",
      },
    });

    // Simulate executeCode generating 250 output entries (limit is 200)
    api.runtime.executeCode.mockImplementation(
      (_lang: any, _code: any, _focus: any, _incomplete: any, _sid: any, observer: any) => {
        observer.onStarted();
        for (let i = 0; i < 250; i++) {
          observer.onOutput(`output ${i}`);
        }
        observer.onCompleted({});
        observer.onFinished();
        return Promise.resolve({});
      }
    );

    const result = await service.dispatch("execute_code", { code: "for i in range(250): print(i)" });
    const parsed = JSON.parse(result.content[0].text);

    // Should have outputsTruncated flag
    expect(parsed.outputsTruncated).toBe(true);
    expect(parsed.outputsTruncatedNote).toContain("200");
    // Should still have the status entries at the end
    const lastEntry = parsed.outputs[parsed.outputs.length - 1];
    expect(lastEntry.text).toBe("Execution finished");
  });
});
