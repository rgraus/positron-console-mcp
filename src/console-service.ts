import { tryAcquirePositronApi } from "@posit-dev/positron";
import type { ConsoleInfo, ExecutionObserver, ToolArgsMap } from "./types";
import { PositronAdapter, EnvMutatorType, type EnvMutatorTypeValue } from "./positron-adapter";

/**
 * Service that wraps the @posit-dev/positron API for use by the MCP server.
 * All methods check for Positron API availability and provide clear error messages
 * when running in standard VS Code (graceful degradation).
 *
 * Uses PositronAdapter to bridge type gaps in the @posit-dev/positron SDK.
 */
export class ConsoleService {
  private adapter: PositronAdapter | null;
  private consoleWidth: number = 80;
  private statusMessage: string = "Positron API not available";

  constructor() {
    // Try to acquire the Positron API — returns null if not running in Positron IDE.
    const api = tryAcquirePositronApi();
    if (api) {
      this.adapter = new PositronAdapter(api);
      this.statusMessage = "Positron API connected";
      // Cache console width updates as they arrive
      try {
        this.adapter.onDidChangeConsoleWidth?.((width: number) => {
          this.consoleWidth = width;
        });
      } catch {
        // onDidChangeConsoleWidth may not be available in older Positron versions
      }
    } else {
      this.adapter = null;
      this.statusMessage =
        "Positron API not available — running in standard VS Code";
    }
  }

  /** Returns whether the Positron API is available. */
  isAvailable(): boolean {
    return this.adapter !== null;
  }

  /** Returns a human-readable status message. */
  getStatus(): string {
    return this.statusMessage;
  }

  /** Ensure the adapter is available, throw descriptive error if not. */
  private requireAdapter(): PositronAdapter {
    if (!this.adapter) {
      throw new Error(
        "Positron API is not available. This tool requires Positron IDE with a running runtime session."
      );
    }
    return this.adapter;
  }

  /**
   * Build a ConsoleInfo from a session object using the adapter's static helpers.
   */
  private sessionToConsoleInfo(s: unknown, index: number, fgSessionId?: string): ConsoleInfo {
    const meta = PositronAdapter.getSessionMetadata(s);
    return {
      index,
      sessionId: meta.sessionId,
      languageId: meta.languageId,
      runtimeName: meta.runtimeName,
      runtimeId: meta.runtimeId,
      isForeground: meta.sessionId === fgSessionId,
    };
  }

  // ─── Console / Session tools ────────────────────────────────────

  /**
   * List all active Positron runtime sessions (consoles).
   */
  async listConsoles(): Promise<string> {
    const adapter = this.requireAdapter();
    const sessions = await adapter.getActiveSessions();
    const foreground = await adapter.getForegroundSession();
    const fgSessionId = foreground ? PositronAdapter.getSessionId(foreground) : undefined;

    const consoles: ConsoleInfo[] = sessions.map((s, i) =>
      this.sessionToConsoleInfo(s, i, fgSessionId)
    );

    return JSON.stringify({ consoles, count: consoles.length }, null, 2);
  }

  /**
   * Get the currently active (foreground) Console session.
   */
  async getActiveConsole(): Promise<string> {
    const adapter = this.requireAdapter();
    const session = await adapter.getForegroundSession();

    if (!session) {
      return JSON.stringify(
        { activeConsole: null, message: "No active console session" },
        null,
        2
      );
    }

    const meta = PositronAdapter.getSessionMetadata(session);
    const consoleInfo: ConsoleInfo = {
      sessionId: meta.sessionId,
      languageId: meta.languageId,
      runtimeName: meta.runtimeName,
      runtimeId: meta.runtimeId,
      isForeground: true,
      index: -1, // unknown index from this API
    };

    return JSON.stringify({ activeConsole: consoleInfo }, null, 2);
  }

  /**
   * Switch the foreground session to a specific Console by session ID or index.
   */
  async focusConsole(
    args: ToolArgsMap["focus_console"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const sessionId = args.sessionId;
    const index = args.index;

    if (sessionId) {
      // Look up the session to get its languageId — required for executeCode
      const sessions = await adapter.getActiveSessions();
      const found = sessions.find(
        (s) => PositronAdapter.getSessionId(s) === sessionId
      );
      if (!found) {
        return JSON.stringify(
          {
            focused: false,
            sessionId,
            error: `Session ${sessionId} not found among active sessions`,
          },
          null,
          2
        );
      }
      const langId = PositronAdapter.getSessionLanguageId(found);
      try {
        await adapter.executeCode({
          languageId: langId,
          code: "", // no-op — empty code
          focus: true,
          allowIncomplete: false,
          sessionId,
          observer: {
            onStarted: () => { /* noop */ },
            onFinished: () => { /* noop */ },
          },
        });
        return JSON.stringify(
          {
            focused: true,
            sessionId,
            languageId: langId,
            method: "executeCode no-op with focus:true",
          },
          null,
          2
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify(
          {
            focused: false,
            sessionId,
            error: `Failed to focus session: ${message}`,
          },
          null,
          2
        );
      }
    }

    if (index !== undefined) {
      const sessions = await adapter.getActiveSessions();
      if (index < 0 || index >= sessions.length) {
        return JSON.stringify(
          {
            focused: false,
            index,
            error: `Index ${index} out of range (0–${sessions.length - 1})`,
          },
          null,
          2
        );
      }
      const targetSessionId = PositronAdapter.getSessionId(sessions[index]);
      return this.focusConsole({ sessionId: targetSessionId });
    }

    return JSON.stringify(
      {
        focused: false,
        error: "Either sessionId or index must be provided",
      },
      null,
      2
    );
  }

  /**
   * Execute code in a Positron Console with full observer-based output capture.
   */
  async executeCode(
    args: ToolArgsMap["execute_code"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const code = args.code;
    if (!code || code.trim().length === 0) {
      return JSON.stringify({ error: "No code provided" }, null, 2);
    }

    const languageId = args.languageId;

    // Resolve language: prefer explicit, fall back to foreground session
    let resolvedLanguage = languageId;
    if (!resolvedLanguage) {
      const fg = await adapter.getForegroundSession();
      if (!fg) {
        return JSON.stringify(
          {
            error:
              "No active console session and no languageId specified",
          },
          null,
          2
        );
      }
      resolvedLanguage = PositronAdapter.getSessionLanguageId(fg);
    }

    const sessionId = args.sessionId;
    const allowIncomplete = args.allowIncomplete ?? false;
    const timeoutMs = args.timeoutMs || 60_000;

    // ── Output truncation constants ─────────────────────────────
    const MAX_OUTPUT_LENGTH = 500_000; // 500 KB per output entry
    const MAX_TOTAL_OUTPUTS = 200; // max number of output entries collected

    // Build output collector using observer pattern
    const outputs: {
      type: "status" | "output" | "error";
      text?: string;
      truncated?: boolean;
    }[] = [];
    let mimeTypesSummary: string[] = [];
    let timedOut = false;

    const truncateIfNeeded = (text: string): string => {
      if (text.length > MAX_OUTPUT_LENGTH) {
        return (
          text.substring(0, MAX_OUTPUT_LENGTH) +
          `\n... [truncated ${text.length - MAX_OUTPUT_LENGTH} chars]`
        );
      }
      return text;
    };

    const observer: ExecutionObserver = {
      onStarted: () => {
        outputs.push({ type: "status", text: "Execution started" });
      },
      onOutput: (message: string) => {
        if (outputs.length < MAX_TOTAL_OUTPUTS) {
          const truncated = message.length > MAX_OUTPUT_LENGTH;
          outputs.push({
            type: "output",
            text: truncateIfNeeded(message),
            truncated: truncated || undefined,
          });
        }
      },
      onError: (error: string) => {
        outputs.push({
          type: "error",
          text: truncateIfNeeded(error),
        });
      },
      onCompleted: (result: Record<string, unknown>) => {
        // Extract MIME type summary from result if available
        if (result) {
          const mimeRaw = (result as { mimeTypes?: unknown }).mimeTypes;
          if (mimeRaw) {
            mimeTypesSummary = Array.isArray(mimeRaw)
              ? (mimeRaw as string[])
              : Object.keys(mimeRaw as Record<string, unknown>);
          } else if (typeof result === "object") {
            mimeTypesSummary = Object.keys(result).filter(
              (k) => k !== "data" && k !== "metadata"
            );
          }
        }
        outputs.push({ type: "status", text: "Execution completed" });
      },
      onFinished: () => {
        outputs.push({ type: "status", text: "Execution finished" });
      },
    };

    try {
      const executionPromise = adapter.executeCode({
        languageId: resolvedLanguage,
        code,
        focus: true, // bring the console to the foreground
        allowIncomplete,
        sessionId: sessionId || undefined,
        observer,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          timedOut = true;
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);

      const response: Record<string, unknown> = {
        code,
        languageId: resolvedLanguage,
        outputs,
        result,
      };
      if (sessionId !== undefined) {
        response["sessionId"] = sessionId;
      }
      if (mimeTypesSummary.length > 0) {
        response["mimeTypes"] = mimeTypesSummary;
      }
      if (outputs.length >= MAX_TOTAL_OUTPUTS) {
        response["outputsTruncated"] = true;
        response["outputsTruncatedNote"] =
          `Output collection limited to ${MAX_TOTAL_OUTPUTS} entries`;
      }

      return JSON.stringify(response, null, 2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const response: Record<string, unknown> = {
        code,
        languageId: resolvedLanguage,
        outputs,
        error: message,
        timedOut,
      };
      if (sessionId !== undefined) {
        response["sessionId"] = sessionId;
      }
      if (mimeTypesSummary.length > 0) {
        response["mimeTypes"] = mimeTypesSummary;
      }
      return JSON.stringify(response, null, 2);
    }
  }

  /**
   * Retrieve the list of variables defined in a Positron Console session.
   */
  async getSessionVariables(
    args: ToolArgsMap["get_session_variables"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const sessionId = args.sessionId;

    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const fg = await adapter.getForegroundSession();
      if (!fg) {
        return JSON.stringify(
          { error: "No active console session" },
          null,
          2
        );
      }
      targetSessionId = PositronAdapter.getSessionId(fg);
    }

    try {
      const variables = await adapter.getSessionVariables(targetSessionId);
      return JSON.stringify(
        { sessionId: targetSessionId, variables },
        null,
        2
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify(
        { sessionId: targetSessionId, error: message },
        null,
        2
      );
    }
  }

  /**
   * Get the user's preferred runtime for a given language.
   */
  async getPreferredRuntime(
    args: ToolArgsMap["get_preferred_runtime"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const languageId = args.languageId;
    if (!languageId) {
      return JSON.stringify(
        { error: "languageId is required" },
        null,
        2
      );
    }

    const info = await adapter.getPreferredRuntime(languageId);
    return JSON.stringify(info, null, 2);
  }

  /**
   * Register a database/data-source connection driver and connect.
   */
  async createConnection(
    args: ToolArgsMap["create_connection"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const driverId = args.driverId;
    const inputs = args.inputs;
    const name = args.name;
    const languageId = args.languageId;

    if (!driverId) {
      return JSON.stringify({ error: "driverId is required" }, null, 2);
    }

    try {
      await adapter.registerConnectionDriver({
        driverId,
        languageId: languageId || "python",
        inputs: inputs || [],
      });
      return JSON.stringify(
        {
          success: true,
          driverId,
          name: name || driverId,
        },
        null,
        2
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify(
        { success: false, driverId, error: message },
        null,
        2
      );
    }
  }

  /**
   * Get the current Console panel width (in characters).
   */
  getConsoleWidth(): string {
    this.requireAdapter();
    return JSON.stringify({ width: this.consoleWidth }, null, 2);
  }

  /**
   * Set or unset an environment variable in Positron session environments.
   *
   * Modifies the environment contributions map returned by the Positron API.
   * The API returns a mutable reference keyed by extension ID, where each
   * extension contributes an array of `EnvironmentVariableAction` objects.
   * Positron reads this struct when launching new sessions to build the
   * process environment.
   *
   * Mutator type mapping:
   *   "set"    → Replace (overwrite existing value)
   *   "append" → Append (add to end of existing value with separator)
   *   "prepend"→ Prepend (add to start of existing value with separator)
   *   "unset"  → Removes the variable entry entirely
   */
  async setEnvironmentVariable(
    args: ToolArgsMap["set_environment_variable"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const name = args.name;
    const value = args.value;
    const action = args.action ?? "set";

    if (!name) {
      return JSON.stringify(
        { error: "Variable name is required" },
        null,
        2
      );
    }

    // Extension ID used as the key in Positron's contributions map
    const EXTENSION_ID = "positron-console-mcp";

    const contributions = await adapter.getEnvironmentContributions();

    if (action === "unset") {
      // Remove the variable entry for this extension
      if (contributions[EXTENSION_ID]) {
        contributions[EXTENSION_ID] = contributions[EXTENSION_ID].filter(
          (v) => v.name !== name
        );
        // Clean up empty arrays
        if (contributions[EXTENSION_ID].length === 0) {
          delete contributions[EXTENSION_ID];
        }
      }

      return JSON.stringify(
        { action, name, success: true },
        null,
        2
      );
    }

    // VS Code EnvironmentVariableMutatorType enum values:
    //   Replace = 1, Append = 2, Prepend = 3
    const mutatorMap: Record<string, EnvMutatorTypeValue> = {
      set: EnvMutatorType.Replace,
      append: EnvMutatorType.Append,
      prepend: EnvMutatorType.Prepend,
    };

    const mutatorType = mutatorMap[action] ?? EnvMutatorType.Replace;
    const varAction = {
      action: mutatorType,
      name,
      value: value ?? "",
    };

    if (!contributions[EXTENSION_ID]) {
      contributions[EXTENSION_ID] = [];
    }

    // Replace existing entry for same variable name, or add new one
    const existingIdx = contributions[EXTENSION_ID].findIndex(
      (v) => v.name === name
    );
    if (existingIdx >= 0) {
      contributions[EXTENSION_ID][existingIdx] = varAction;
    } else {
      contributions[EXTENSION_ID].push(varAction);
    }

    return JSON.stringify(
      {
        action,
        name,
        value,
        mutatorType:
          action === "set" ? "Replace" : action === "append" ? "Append" : "Prepend",
        success: true,
      },
      null,
      2
    );
  }

  /**
   * Get the currently active editor file path and text selection from Positron.
   */
  async getEditorContext(): Promise<string> {
    const adapter = this.requireAdapter();
    try {
      const ctx = await adapter.lastActiveEditorContext();
      if (!ctx) {
        return JSON.stringify(
          { editor: null, message: "No active editor" },
          null,
          2
        );
      }
      const editorCtx = {
        document: ctx.document
          ? {
              path: ctx.document.path,
              languageId: ctx.document.languageId,
            }
          : undefined,
        selection:
          ctx.selection !== undefined
            ? String(ctx.selection)
            : undefined,
      };
      return JSON.stringify(editorCtx, null, 2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify(
        { error: `Failed to get editor context: ${message}` },
        null,
        2
      );
    }
  }

  /**
   * Open a URL or HTML content in the Positron Viewer pane.
   */
  async openViewer(
    args: ToolArgsMap["open_viewer"]
  ): Promise<string> {
    const adapter = this.requireAdapter();
    const url = args.url;
    if (!url) {
      return JSON.stringify({ error: "URL is required" }, null, 2);
    }

    await adapter.previewUrl(url);
    return JSON.stringify({ opened: url }, null, 2);
  }

  /**
   * Get current plot rendering dimensions.
   */
  async getPlotSettings(): Promise<string> {
    const adapter = this.requireAdapter();
    try {
      const settings = await adapter.getPlotsRenderSettings();
      return JSON.stringify(settings, null, 2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify(
        { error: `Failed to get plot settings: ${message}` },
        null,
        2
      );
    }
  }

  /**
   * Dispatch a tool call by name to the appropriate method.
   * Returns MCP-compliant content response.
   *
   * Uses a typed dispatch map to localize ToolArgsMap casts to one place per tool.
   */
  async dispatch(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{
    content: { type: "text"; text: string }[];
    isError?: boolean;
  }> {
    // Each entry wraps the ToolArgsMap cast in one place — the rest of the
    // method body is type-safe through Record<string, unknown> args.
    const dispatchMap: Record<string, (a: Record<string, unknown>) => Promise<string> | string> = {
      list_consoles: () => this.listConsoles(),
      get_active_console: () => this.getActiveConsole(),
      focus_console: (a) => this.focusConsole(a as unknown as ToolArgsMap["focus_console"]),
      execute_code: (a) => this.executeCode(a as unknown as ToolArgsMap["execute_code"]),
      get_session_variables: (a) => this.getSessionVariables(a as unknown as ToolArgsMap["get_session_variables"]),
      get_preferred_runtime: (a) => this.getPreferredRuntime(a as unknown as ToolArgsMap["get_preferred_runtime"]),
      create_connection: (a) => this.createConnection(a as unknown as ToolArgsMap["create_connection"]),
      get_console_width: () => this.getConsoleWidth(),
      set_environment_variable: (a) => this.setEnvironmentVariable(a as unknown as ToolArgsMap["set_environment_variable"]),
      get_editor_context: () => this.getEditorContext(),
      open_viewer: (a) => this.openViewer(a as unknown as ToolArgsMap["open_viewer"]),
      get_plot_settings: () => this.getPlotSettings(),
    };

    const handler = dispatchMap[toolName];
    if (!handler) {
      return {
        content: [
          { type: "text", text: `Unknown tool: ${toolName}` },
        ],
        isError: true,
      };
    }

    try {
      const result = await handler(args);
      return { content: [{ type: "text", text: result }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }
}