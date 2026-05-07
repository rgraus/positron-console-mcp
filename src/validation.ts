import { z } from "zod";

/**
 * Zod schemas for validating MCP tool arguments.
 *
 * Each tool has a corresponding Zod schema that validates incoming arguments
 * before they reach the business logic layer. This catches type errors,
 * missing required fields, and malformed inputs at the MCP boundary.
 */

// ── Focus Console ─────────────────────────────────────────────────
export const FocusConsoleArgsSchema = z.object({
  sessionId: z.string().optional(),
  index: z.number().int().min(0).optional(),
});

// ── Execute Code ──────────────────────────────────────────────────
export const ExecuteCodeArgsSchema = z.object({
  code: z.string().min(1, "code is required and must not be empty"),
  languageId: z.string().optional(),
  sessionId: z.string().optional(),
  allowIncomplete: z.boolean().optional(),
  timeoutMs: z.number().int().positive().max(300_000).optional(),
});

// ── Session Variables ─────────────────────────────────────────────
export const SessionVariablesArgsSchema = z.object({
  sessionId: z.string().optional(),
});

// ── Preferred Runtime ─────────────────────────────────────────────
export const PreferredRuntimeArgsSchema = z.object({
  languageId: z.string().min(1, "languageId is required"),
});

// ── Create Connection ─────────────────────────────────────────────
const ConnectionInputSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["string", "number", "boolean"]),
  value: z.string(),
});

export const CreateConnectionArgsSchema = z.object({
  driverId: z.string().min(1, "driverId is required"),
  inputs: z.array(ConnectionInputSchema).optional(),
  name: z.string().optional(),
  languageId: z.string().optional(),
});

// ── Set Environment Variable ──────────────────────────────────────
export const SetEnvironmentVariableArgsSchema = z.object({
  name: z.string().min(1, "name is required"),
  value: z.string(),
  action: z.enum(["set", "unset", "append", "prepend"]).optional(),
});

// ── Open Viewer ───────────────────────────────────────────────────
export const OpenViewerArgsSchema = z.object({
  url: z.string().min(1, "url is required"),
});

// ── Tool Schemas Map ──────────────────────────────────────────────
// Tools with no arguments use z.object({}).passthrough() to accept empty args
// while still providing validation that args is an object.

const EmptyArgsSchema = z.object({}).passthrough();

export const TOOL_SCHEMAS: Record<string, z.ZodType> = {
  list_consoles: EmptyArgsSchema,
  get_active_console: EmptyArgsSchema,
  focus_console: FocusConsoleArgsSchema,
  execute_code: ExecuteCodeArgsSchema,
  get_session_variables: SessionVariablesArgsSchema,
  get_preferred_runtime: PreferredRuntimeArgsSchema,
  create_connection: CreateConnectionArgsSchema,
  get_console_width: EmptyArgsSchema,
  set_environment_variable: SetEnvironmentVariableArgsSchema,
  get_editor_context: EmptyArgsSchema,
  open_viewer: OpenViewerArgsSchema,
  get_plot_settings: EmptyArgsSchema,
};

/**
 * Validate tool arguments against the corresponding Zod schema.
 * Returns the parsed (and potentially coerced/defaulted) arguments,
 * or an error message string if validation fails.
 */
export function validateToolArgs(
  toolName: string,
  args: unknown,
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = TOOL_SCHEMAS[toolName];

  if (!schema) {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  const result = schema.safeParse(args ?? {});
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    return { success: false, error: `Invalid arguments for ${toolName}: ${messages}` };
  }

  return { success: true, data: result.data as Record<string, unknown> };
}