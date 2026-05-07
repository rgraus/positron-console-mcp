import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { localhostHostValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ConsoleService } from "./console-service";
import { TOOL_DEFINITIONS } from "./types";
import { validateToolArgs } from "./validation";

// ─── Simple in-memory rate limiter ───────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 120; // 120 requests per minute per IP

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || "127.0.0.1";
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({
      error: "Too many requests. Please slow down.",
      retryAfterMs: entry.resetAt - now,
    });
    return;
  }

  next();
}

// Periodically clean up expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, 300_000).unref(); // unref so timer doesn't keep process alive

/**
 * Embedded SVG logo for the /logo endpoint.
 * Represents a Positron Console icon — a terminal/console with a data science accent.
 */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect width="128" height="128" rx="16" fill="#1A1A2E"/>
  <rect x="16" y="24" width="96" height="72" rx="6" fill="#16213E" stroke="#4472C4" stroke-width="2"/>
  <text x="22" y="44" font-family="monospace" font-size="11" fill="#50FA7B">> console</text>
  <text x="22" y="62" font-family="monospace" font-size="11" fill="#F1FA8C">  .run(code)</text>
  <text x="22" y="80" font-family="monospace" font-size="11" fill="#FF79C6">  MCP</text>
  <circle cx="104" cy="24" r="10" fill="#50FA7B"/>
  <text x="100" y="29" font-family="monospace" font-size="10" fill="#1A1A2E" font-weight="bold">✓</text>
</svg>`;

/**
 * McpConsoleServer — MCP Streamable HTTP server embedded in the VS Code / Positron extension host.
 *
 * Provides 12 tools for controlling Positron Consoles:
 *   list_consoles, get_active_console, focus_console, execute_code,
 *   get_session_variables, get_preferred_runtime, create_connection,
 *   get_console_width, set_environment_variable, get_editor_context,
 *   open_viewer, get_plot_settings
 *
 * Follows stateless Streamable HTTP pattern — a new MCP Server instance is created
 * per POST /mcp request.
 */
export class McpConsoleServer {
  private app: express.Application | null = null;
  private httpServer: ReturnType<express.Application["listen"]> | null = null;
  private consoleService: ConsoleService;
  private port: number;

  constructor(port: number) {
    this.port = port;
    this.consoleService = new ConsoleService();
  }

  /**
   * Dispatch a tool call directly to the console service.
   * Exposed publicly for unit testing and internal use.
   */
  async dispatch(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
    return this.consoleService.dispatch(toolName, args);
  }

  /**
   * Create a new MCP Server instance for a single request.
   * This is the stateless pattern: each POST gets its own transport + server.
   */
  private async createMcpServer(): Promise<Server> {
    const server = new Server(
      {
        name: "positron-console-automatization",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // ── Tool listing ────────────────────────────────────────────
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      })),
    }));

    // ── Tool invocation (with Zod input validation) ────────────
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Validate tool arguments against Zod schemas
      const validation = validateToolArgs(name as string, args);
      if (!validation.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: validation.error }, null, 2) }],
          isError: true,
        };
      }

      return this.consoleService.dispatch(name as string, validation.data);
    });

    return server;
  }

  /**
   * Handle a POST request to /mcp — create ephemeral server, transport, process request.
   */
  private async handleMcpPost(req: Request, res: Response): Promise<void> {
    try {
      const mcpServer = await this.createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no session IDs
        enableJsonResponse: true, // Return JSON instead of SSE for stateless requests
      });

      // Connect server to transport
      await mcpServer.connect(transport);

      // Let the transport handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  }

  /**
   * Handle DELETE /mcp — MCP Streamable HTTP cleanup endpoint.
   * Required by the MCP protocol spec even in stateless mode.
   */
  private handleMcpDelete(_req: Request, res: Response): void {
    res.status(204).end(); // No content — all sessions are ephemeral/stateless
  }

  /**
   * Handle GET /mcp — MCP Streamable HTTP SSE endpoint.
   * Returns 405 Method Not Allowed in stateless mode per the spec.
   */
  private handleMcpGet(_req: Request, res: Response): void {
    res
      .status(405)
      .set("Allow", "POST, DELETE")
      .json({ error: "GET not supported — use POST for stateless MCP" });
  }

  /**
   * Health check endpoint.
   */
  private handleHealth(_req: Request, res: Response): void {
    res.json({
      status: "ok",
      service: "positron-console-automatization",
      version: "0.1.0",
      positronAvailable: this.consoleService.isAvailable(),
      positronStatus: this.consoleService.getStatus(),
    });
  }

  /**
   * Start the HTTP server on the configured port.
   * Tries ports from `this.port` through `this.port + 9` if the initial port is busy.
   */
  async start(): Promise<number> {
    if (this.app) {
      await this.stop();
    }

    this.app = express();

    // Host header validation middleware (localhost only)
    this.app.use(localhostHostValidation());

    // Parse JSON bodies — 5 MB limit for code execution payloads
    this.app.use(express.json({ limit: "5mb" }));


    // Enable CORS for localhost clients
    this.app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
      next();
    });

    // Rate limiting — applied to MCP POST (the heavy endpoint)
    this.app.use("/mcp", rateLimiter);

    // MCP endpoints — POST, DELETE, GET per Streamable HTTP spec
    this.app.post("/mcp", (req, res) => this.handleMcpPost(req, res));
    this.app.delete("/mcp", (req, res) => this.handleMcpDelete(req, res));
    this.app.get("/mcp", (req, res) => this.handleMcpGet(req, res));

    // CORS preflight for /mcp
    this.app.options("/mcp", (_req, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
      res.status(204).end();
    });

    // Health check
    this.app.get("/health", (req, res) => this.handleHealth(req, res));

    // Logo / favicon endpoint (SVG icon for MCP server identity)
    this.app.get("/logo", (_req, res) => {
      res.set("Content-Type", "image/svg+xml");
      res.set("Cache-Control", "public, max-age=86400");
      res.send(LOGO_SVG);
    });

    // Try ports from this.port through this.port + 9
    let assignedPort = this.port;
    const maxPort = this.port + 9;

    while (assignedPort <= maxPort) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.httpServer = this.app!.listen(assignedPort, "127.0.0.1", () => {
            resolve();
          });
          this.httpServer!.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
              reject(new Error("EADDRINUSE"));
            } else {
              reject(err);
            }
          });
        });
        this.port = assignedPort;
        console.log(`[PositronConsoleMCP] MCP server started on http://127.0.0.1:${this.port}/mcp`);
        return this.port;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === "EADDRINUSE") {
          console.log(`[PositronConsoleMCP] Port ${assignedPort} in use, trying ${assignedPort + 1}...`);
          assignedPort++;
        } else {
          throw err;
        }
      }
    }

    throw new Error(`Could not find an available port in range ${this.port}–${maxPort}`);
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.httpServer = null;
      console.log("[PositronConsoleMCP] MCP server stopped");
    }
    this.app = null;
  }

  /**
   * Get the current port the server is running on.
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Check if the server is currently running.
   */
  isRunning(): boolean {
    return this.httpServer !== null;
  }
}