import { describe, it, expect } from "vitest";
import { validateToolArgs, TOOL_SCHEMAS } from "../validation";

describe("validation", () => {
  // ── Schema coverage ─────────────────────────────────────────────
  it("should have a Zod schema for every registered tool", () => {
    const known = [
      "list_consoles",
      "get_active_console",
      "focus_console",
      "execute_code",
      "get_session_variables",
      "get_preferred_runtime",
      "create_connection",
      "get_console_width",
      "set_environment_variable",
      "get_editor_context",
      "open_viewer",
      "get_plot_settings",
    ];
    for (const name of known) {
      expect(TOOL_SCHEMAS[name]).toBeDefined();
      expect(
        typeof TOOL_SCHEMAS[name]?.safeParse,
        `Missing safeParse on schema for ${name}`
      ).toBe("function");
    }
  });

  it("should export exactly 12 tool schemas", () => {
    expect(Object.keys(TOOL_SCHEMAS)).toHaveLength(12);
  });

  // ── Empty-args tools (no required params) ───────────────────────
  it("should pass validation for tools with no arguments", () => {
    for (const name of [
      "list_consoles",
      "get_active_console",
      "get_console_width",
      "get_editor_context",
      "get_plot_settings",
    ]) {
      expect(validateToolArgs(name, {}).success, `name=${name}`).toBe(true);
      expect(validateToolArgs(name, undefined).success, `name=${name}`).toBe(true);
    }
  });

  // ── focus_console ───────────────────────────────────────────────
  it("focus_console: success with sessionId", () => {
    const r = validateToolArgs("focus_console", { sessionId: "abc" });
    expect(r.success).toBe(true);
  });

  it("focus_console: success with valid index", () => {
    const r = validateToolArgs("focus_console", { index: 3 });
    expect(r.success).toBe(true);
  });

  it("focus_console: rejects negative index", () => {
    const r = validateToolArgs("focus_console", { index: -1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("index");
  });

  // ── execute_code ────────────────────────────────────────────────
  it("execute_code: success with minimal args", () => {
    const r = validateToolArgs("execute_code", { code: "1+1" });
    expect(r.success).toBe(true);
  });

  it("execute_code: rejects empty code string", () => {
    const r = validateToolArgs("execute_code", { code: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("code");
  });

  it("execute_code: rejects missing code", () => {
    const r = validateToolArgs("execute_code", {});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("code");
  });

  it("execute_code: rejects timeout exceeding 300s", () => {
    const r = validateToolArgs("execute_code", { code: "1", timeoutMs: 400_000 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("300000");
  });

  it("execute_code: accepts languageId and sessionId", () => {
    const r = validateToolArgs("execute_code", {
      code: "x",
      languageId: "r",
      sessionId: "sess-1",
    });
    expect(r.success).toBe(true);
  });

  // ── get_session_variables ───────────────────────────────────────
  it("get_session_variables: success with and without sessionId", () => {
    expect(validateToolArgs("get_session_variables", {}).success).toBe(true);
    expect(
      validateToolArgs("get_session_variables", { sessionId: "s1" }).success
    ).toBe(true);
  });

  // ── get_preferred_runtime ───────────────────────────────────────
  it("get_preferred_runtime: success", () => {
    expect(
      validateToolArgs("get_preferred_runtime", { languageId: "python" }).success
    ).toBe(true);
  });

  it("get_preferred_runtime: rejects empty languageId", () => {
    const r = validateToolArgs("get_preferred_runtime", { languageId: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("languageId");
  });

  // ── create_connection ───────────────────────────────────────────
  it("create_connection: success with driverId and inputs", () => {
    const r = validateToolArgs("create_connection", {
      driverId: "pg",
      inputs: [{ id: "h", label: "Host", type: "string", value: "localhost" }],
    });
    expect(r.success).toBe(true);
  });

  it("create_connection: rejects empty driverId", () => {
    const r = validateToolArgs("create_connection", { driverId: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("driverId");
  });

  it("create_connection: rejects invalid input type", () => {
    const r = validateToolArgs("create_connection", {
      driverId: "pg",
      inputs: [{ id: "h", label: "Host", type: "invalid", value: "x" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("type");
  });

  // ── set_environment_variable ────────────────────────────────────
  it("set_environment_variable: success with name+value", () => {
    const r = validateToolArgs("set_environment_variable", {
      name: "VAR",
      value: "hello",
    });
    expect(r.success).toBe(true);
  });

  it("set_environment_variable: action defaults to undefined (optional)", () => {
    const r = validateToolArgs("set_environment_variable", {
      name: "VAR",
      value: "hello",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.action).toBeUndefined();
  });

  it("set_environment_variable: accepts set/unset/append/prepend", () => {
    for (const action of ["set", "unset", "append", "prepend"]) {
      const r = validateToolArgs("set_environment_variable", {
        name: "X",
        value: "1",
        action,
      });
      expect(r.success).toBe(true);
    }
  });

  it("set_environment_variable: rejects invalid action", () => {
    const r = validateToolArgs("set_environment_variable", {
      name: "X",
      value: "1",
      action: "invalid",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("action");
  });

  // ── open_viewer ─────────────────────────────────────────────────
  it("open_viewer: success with url", () => {
    expect(validateToolArgs("open_viewer", { url: "https://a.b" }).success).toBe(true);
  });

  it("open_viewer: rejects empty url", () => {
    const r = validateToolArgs("open_viewer", { url: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("url");
  });

  // ── Unknown tool ────────────────────────────────────────────────
  it("validateToolArgs returns error for unknown tool", () => {
    const r = validateToolArgs("nonexistent", {});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Unknown tool");
  });
});