import * as vscode from "vscode";
import { tryAcquirePositronApi } from "@posit-dev/positron";
import { McpConsoleServer } from "./server";

/**
 * Extension version from package.json — kept in sync at build time by esbuild.
 *
 * We use `require` here because esbuild bundles `package.json` into the output
 * at build time. The `as string` cast is safe: `version` is always a string in
 * package.json per the npm spec. This approach avoids the dynamic `import` /
 * top-level await complexity in a synchronous non-module entry point.
 *
 * Tracked at: https://github.com/davidrsch/positron-console-mcp/issues (upstream)
 * If VS Code extension API ever provides a blessed `context.extensionVersion` we
 * can remove this cast.
 */
const EXTENSION_VERSION = require("../package.json").version as string;

let mcpServer: McpConsoleServer | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let restartDisposable: vscode.Disposable | null = null;

/**
 * Activate the extension — start the MCP server and set up status bar + commands.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("[PositronConsoleMCP] Activating...");

  // Check Positron API availability (logs warning, does not block activation)
  const positronApi = tryAcquirePositronApi();
  if (!positronApi) {
    console.warn(
      "[PositronConsoleMCP] Positron API not available. " +
        "Running in standard VS Code — console/session tools will not work, " +
        "but other IDE tools (editor context, viewer, etc.) may be limited or unavailable."
    );
  } else {
    console.log("[PositronConsoleMCP] Positron API acquired successfully.");
  }

  // Determine port from configuration
  const config = vscode.workspace.getConfiguration("positronConsoleMcp");
  const port = config.get<number>("port") ?? 6071;

  // Create and start the MCP server
  mcpServer = new McpConsoleServer(port);
  try {
    const actualPort = await mcpServer.start();
    console.log(`[PositronConsoleMCP] Server listening on port ${actualPort}`);

    // Update configuration if the port changed (port auto-retry)
    if (actualPort !== port) {
      try {
        await config.update("port", actualPort, vscode.ConfigurationTarget.Global);
      } catch {
        // Non-critical — config update can fail if workspace is not trusted
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Positron Console MCP: Failed to start server — ${message}`
    );
    console.error("[PositronConsoleMCP] Server start failed:", message);
    return;
  }

  // ── Status bar item ────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Commands ───────────────────────────────────────────────────

  // Show Status
  context.subscriptions.push(
    vscode.commands.registerCommand("positronConsoleMcp.showStatus", () => {
      if (!mcpServer) {
        vscode.window.showInformationMessage("Positron Console MCP: Server not running");
        return;
      }
      const port = mcpServer.getPort();
      const running = mcpServer.isRunning();
      const apiAvailable = tryAcquirePositronApi() !== null;
      vscode.window.showInformationMessage(
        `Positron Console MCP v${EXTENSION_VERSION}\n` +
          `Server: ${running ? `Running on port ${port}` : "Not running"}\n` +
          `MCP endpoint: http://localhost:${port}/mcp\n` +
          `Positron API: ${apiAvailable ? "Available" : "Not available"}`
      );
    })
  );

  // Copy MCP Configuration
  context.subscriptions.push(
    vscode.commands.registerCommand("positronConsoleMcp.copyMcpConfig", async () => {
      if (!mcpServer) {
        vscode.window.showErrorMessage("Positron Console MCP: Server not running");
        return;
      }
      const port = mcpServer.getPort();
      const config = {
        servers: {
          "positron-console-automatization": {
            type: "http",
            url: `http://localhost:${port}/mcp`,
            serverName: "positron-console-automatization",
          },
        },
      };
      await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
      vscode.window.showInformationMessage(
        "MCP configuration copied to clipboard. Paste it into your .vscode/mcp.json or user settings."
      );
    })
  );

  // Add to .vscode/mcp.json
  context.subscriptions.push(
    vscode.commands.registerCommand("positronConsoleMcp.addToMcpJson", async () => {
      if (!mcpServer) {
        vscode.window.showErrorMessage("Positron Console MCP: Server not running");
        return;
      }
      const port = mcpServer.getPort();
      try {
        await vscode.commands.executeCommand(
          "workbench.action.addToMcpJson",
          "positron-console-automatization",
          "http",
          `http://localhost:${port}/mcp`
        );
      } catch {
        // Fallback: copy to clipboard
        const config = {
          servers: {
            "positron-console-automatization": {
              type: "http",
              url: `http://localhost:${port}/mcp`,
              serverName: "positron-console-automatization",
            },
          },
        };
        await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
        vscode.window.showInformationMessage(
          "Could not auto-add to mcp.json. Configuration copied to clipboard instead."
        );
      }
    })
  );

  // Restart Server
  restartDisposable = vscode.commands.registerCommand(
    "positronConsoleMcp.restart",
    async () => {
      if (!mcpServer) return;
      vscode.window.showInformationMessage("Restarting Positron Console MCP server...");
      try {
        await mcpServer.stop();
        const newPort = await mcpServer.start();
        updateStatusBar();
        vscode.window.showInformationMessage(
          `Positron Console MCP server restarted on port ${newPort}`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to restart MCP server: ${message}`);
      }
    }
  );
  context.subscriptions.push(restartDisposable);

  console.log("[PositronConsoleMCP] Activation complete.");
}

/**
 * Deactivate the extension — stop the MCP server.
 */
export async function deactivate(): Promise<void> {
  console.log("[PositronConsoleMCP] Deactivating...");
  if (mcpServer) {
    await mcpServer.stop();
    mcpServer = null;
  }
  if (restartDisposable) {
    restartDisposable.dispose();
    restartDisposable = null;
  }
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = null;
  }
  console.log("[PositronConsoleMCP] Deactivation complete.");
}

/**
 * Update the status bar item text and tooltip.
 */
function updateStatusBar(): void {
  if (!statusBarItem || !mcpServer) return;

  const port = mcpServer.getPort();
  const running = mcpServer.isRunning();
  const apiAvailable = tryAcquirePositronApi() !== null;

  if (running) {
    statusBarItem.text = `$(debug-console) Console MCP :${port}`;
    statusBarItem.tooltip = `Positron Console MCP v${EXTENSION_VERSION} — Listening on port ${port}\nPositron API: ${apiAvailable ? "Available" : "Not available"}\nClick to show status`;
    statusBarItem.command = "positronConsoleMcp.showStatus";
    statusBarItem.color = apiAvailable ? undefined : new vscode.ThemeColor("statusBarItem.warningForeground");
  } else {
    statusBarItem.text = "$(debug-console) Console MCP (stopped)";
    statusBarItem.tooltip = "Positron Console MCP — Server stopped";
    statusBarItem.command = "positronConsoleMcp.restart";
    statusBarItem.color = new vscode.ThemeColor("statusBarItem.errorForeground");
  }
}