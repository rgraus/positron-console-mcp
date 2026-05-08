import { vi } from "vitest";
import { PositronAdapter } from "../positron-adapter";
import type { PositronApi } from "@posit-dev/positron";

/**
 * Creates a mock PositronApi object for use in unit tests.
 * All methods return empty/success results by default; individual tests
 * override specific methods as needed via vi.fn() mocking.
 */
export function createMockPositronApi() {
  return {
    version: "1.0.0",
    runtime: {
      executeCode: vi.fn().mockResolvedValue({}),
      getPreferredRuntime: vi.fn().mockResolvedValue({
        runtimeName: "Python 3.12",
        runtimeId: "python-3.12",
      }),
      getActiveSessions: vi.fn().mockResolvedValue([]),
      getForegroundSession: vi.fn().mockResolvedValue(undefined),
      getSessionVariables: vi.fn().mockResolvedValue([]),
      onDidExecuteCode: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeForegroundSession: vi.fn(() => ({ dispose: vi.fn() })),
    },
    window: {
      previewUrl: vi.fn().mockResolvedValue(undefined),
      showSimpleModalDialogPrompt: vi.fn().mockResolvedValue(true),
      getPlotsRenderSettings: vi.fn().mockResolvedValue({
        size: { width: 800, height: 600 },
      }),
      onDidChangeConsoleWidth: vi.fn(() => ({ dispose: vi.fn() })),
    },
    connections: {
      registerConnectionDriver: vi.fn(),
    },
    methods: {
      lastActiveEditorContext: vi.fn().mockResolvedValue(null),
      call: vi.fn().mockResolvedValue({}),
      showQuestion: vi.fn().mockResolvedValue(true),
      showDialog: vi.fn().mockResolvedValue(undefined),
    },
    environment: {
      getEnvironmentContributions: vi.fn().mockResolvedValue({}),
    },
    languages: {
      registerStatementRangeProvider: vi.fn(),
      registerHelpTopicProvider: vi.fn(),
    },
  };
}

/**
 * Creates a PositronAdapter wrapping a mock PositronApi.
 * Tests use this to get a typed adapter with mock methods.
 */
export function createMockAdapter(): PositronAdapter {
  const mockApi = createMockPositronApi() as unknown as PositronApi;
  return new PositronAdapter(mockApi);
}
