/**
 * Core type definitions for Positron Console MCP server.
 */

export interface ConsoleInfo {
  index: number;
  sessionId: string;
  languageId: string;
  runtimeName: string;
  runtimeId: string;
  isForeground: boolean;
  variables?: string[];
}

/**
 * Minimal type for a Positron runtime session returned by the API.
 * The @posit-dev/positron package may not export comprehensive session types,
 * so we define the shape we depend on.
 */
export interface PositronRuntimeSession {
  metadata: {
    sessionId: string;
    languageId: string;
    runtimeName: string;
    runtimeId: string;
  };
}

export interface ExecutionObserver {
  onStarted?: () => void;
  onOutput?: (message: string) => void;
  onError?: (error: string) => void;
  onCompleted?: (result: Record<string, unknown>) => void;
  onFinished?: () => void;
}

export interface ExecutionOutput {
  type: "status" | "output" | "error";
  text?: string;
  html?: string;
  error?: string;
}

export interface ExecutionResult {
  code: string;
  languageId: string;
  sessionId?: string;
  outputs: ExecutionOutput[];
  result?: Record<string, unknown>;
  error?: string;
}

export interface ConnectionInput {
  id: string;
  label: string;
  type: "string" | "number" | "boolean";
  value: string;
}

export interface RuntimeInfo {
  runtimeName: string;
  runtimeId: string;
  languageId: string;
}

export interface EditorContext {
  document?: {
    path: string;
    languageId: string;
  };
  selection?: string;
}

/**
 * Discriminated argument types for each tool.
 * Enables type-safe tool dispatch without `Record<string, unknown>`.
 */
export interface FocusConsoleArgs {
  sessionId?: string;
  index?: number;
}

export interface ExecuteCodeArgs {
  code: string;
  languageId?: string;
  sessionId?: string;
  allowIncomplete?: boolean;
  timeoutMs?: number;
}

export interface SessionVariablesArgs {
  sessionId?: string;
}

export interface PreferredRuntimeArgs {
  languageId: string;
}

export interface CreateConnectionArgs {
  driverId: string;
  inputs?: ConnectionInput[];
  name?: string;
  languageId?: string;
}

export interface SetEnvironmentVariableArgs {
  name: string;
  value: string;
  action?: "set" | "unset";
}

export interface OpenViewerArgs {
  url: string;
}

/**
 * Union of all tool argument types, keyed by tool name.
 */
export type ToolArgsMap = {
  list_consoles: Record<string, never>;
  get_active_console: Record<string, never>;
  focus_console: FocusConsoleArgs;
  execute_code: ExecuteCodeArgs;
  get_session_variables: SessionVariablesArgs;
  get_preferred_runtime: PreferredRuntimeArgs;
  create_connection: CreateConnectionArgs;
  get_console_width: Record<string, never>;
  set_environment_variable: SetEnvironmentVariableArgs;
  get_editor_context: Record<string, never>;
  open_viewer: OpenViewerArgs;
  get_plot_settings: Record<string, never>;
};

/**
 * MCP Tool input schemas — flattened into tool definitions.
 */
export const TOOL_DEFINITIONS = [
  {
    name: "list_consoles",
    title: "List Consoles",
    description: "List all active Positron runtime sessions (consoles). Returns session metadata, language, runtime name, and foreground status.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_active_console",
    title: "Get Active Console",
    description: "Get the currently active (foreground) Console session.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "focus_console",
    title: "Focus Console",
    description: "Switch to a specific Console by session ID or index.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string", description: "Session ID to focus" },
        index: { type: "number", description: "Console index (0-based)" },
      },
    },
  },
  {
    name: "execute_code",
    title: "Execute Code",
    description: "Execute code in a Positron Console with full observer-based output capture. Returns structured results (text, HTML, MIME data, exit status).",
    inputSchema: {
      type: "object" as const,
      required: ["code"],
      properties: {
        code: { type: "string", description: "Code to execute" },
        languageId: { type: "string", description: "Language (python, r, etc.). Defaults to foreground session language." },
        sessionId: { type: "string", description: "Target session ID (defaults to foreground)" },
        allowIncomplete: { type: "boolean", description: "Allow incomplete statements (default: false)" },
        timeoutMs: { type: "number", description: "Timeout in ms (default: 60000)" },
      },
    },
  },
  {
    name: "get_session_variables",
    title: "Get Session Variables",
    description: "Retrieve the list of variables defined in a Positron Console session (R data frames, Python variables, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string", description: "Session ID (defaults to foreground)" },
      },
    },
  },
  {
    name: "get_preferred_runtime",
    title: "Get Preferred Runtime",
    description: "Get the user's preferred runtime for a given language (e.g., which Python or R installation).",
    inputSchema: {
      type: "object" as const,
      required: ["languageId"],
      properties: {
        languageId: { type: "string", description: "Language ID (python, r, etc.)" },
      },
    },
  },
  {
    name: "create_connection",
    title: "Create Connection",
    description: "Register a database/data-source connection driver and connect.",
    inputSchema: {
      type: "object" as const,
      required: ["driverId", "inputs"],
      properties: {
        driverId: { type: "string", description: "Connection driver ID" },
        languageId: { type: "string", description: "Language for connection code" },
        name: { type: "string", description: "Display name" },
        inputs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              type: { type: "string", enum: ["string", "number", "boolean"] },
              value: { type: "string" },
            },
          },
          description: "Connection input parameters",
        },
      },
    },
  },
  {
    name: "get_console_width",
    title: "Get Console Width",
    description: "Get the current Console panel width (in characters) for responsive output formatting.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "set_environment_variable",
    title: "Set Environment Variable",
    description: "Contribute an environment variable to be set/unset in Positron session environments.",
    inputSchema: {
      type: "object" as const,
      required: ["name", "value"],
      properties: {
        name: { type: "string", description: "Variable name" },
        value: { type: "string", description: "Variable value" },
        action: { type: "string", enum: ["set", "unset"], description: "Action (default: set)" },
      },
    },
  },
  {
    name: "get_editor_context",
    title: "Get Editor Context",
    description: "Get the currently active editor file path and text selection from Positron.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "open_viewer",
    title: "Open Viewer",
    description: "Open a URL or HTML content in the Positron Viewer pane.",
    inputSchema: {
      type: "object" as const,
      required: ["url"],
      properties: {
        url: { type: "string", description: "URL to open" },
      },
    },
  },
  {
    name: "get_plot_settings",
    title: "Get Plot Settings",
    description: "Get current plot rendering dimensions for custom visualizations.",
    inputSchema: { type: "object" as const, properties: {} },
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];