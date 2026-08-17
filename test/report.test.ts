import { describe, it, expect } from "vitest";
import { formatJson, formatTable, exitCodeFor } from "../src/report";
import type { SuiteRunResult } from "../src/types";

function makeResult(overrides: Partial<SuiteRunResult> = {}): SuiteRunResult {
  return {
    suiteModel: "claude-sonnet-5",
    results: [
      {
        name: "case one",
        prompt: "say hi",
        passed: true,
        response: "hi!",
        assertions: [
          { assertion: { type: "contains", value: "hi" }, passed: true, message: "response contains \"hi\"" },
        ],
        durationMs: 12,
      },
      {
        name: "case two",
        prompt: "say bye",
        passed: false,
        response: "see ya",
        assertions: [
          {
            assertion: { type: "contains", value: "bye" },
            passed: false,
            message: 'expected response to contain "bye" (case-insensitive), but it did not',
          },
        ],
        durationMs: 8,
      },
    ],
    passCount: 1,
    failCount: 1,
    durationMs: 20,
    ...overrides,
  };
}

describe("formatTable", () => {
  it("includes each case name and its pass/fail status", () => {
    const table = formatTable(makeResult());
    expect(table).toContain("case one");
    expect(table).toContain("case two");
    expect(table).toContain("PASS");
    expect(table).toContain("FAIL");
  });

  it("includes the failure reason for a failed assertion", () => {
    const table = formatTable(makeResult());
    expect(table).toContain('expected response to contain "bye"');
  });

  it("includes the summary line with pass/fail counts", () => {
    const table = formatTable(makeResult());
    expect(table).toContain("1 passed, 1 failed");
  });

  it("surfaces a case-level error instead of assertion detail", () => {
    const result = makeResult({
      results: [
        {
          name: "broken case",
          prompt: "trigger error",
          passed: false,
          error: "API unavailable",
          assertions: [],
          durationMs: 3,
        },
      ],
      passCount: 0,
      failCount: 1,
    });
    const table = formatTable(result);
    expect(table).toContain("error: API unavailable");
  });
});

describe("formatJson", () => {
  it("produces valid, parseable JSON with the expected shape", () => {
    const json = formatJson(makeResult());
    const parsed = JSON.parse(json);

    expect(parsed.model).toBe("claude-sonnet-5");
    expect(parsed.passCount).toBe(1);
    expect(parsed.failCount).toBe(1);
    expect(parsed.cases).toHaveLength(2);
    expect(parsed.cases[0].name).toBe("case one");
    expect(parsed.cases[0].passed).toBe(true);
    expect(parsed.cases[1].assertions[0].message).toMatch(/expected response to contain/);
  });
});

describe("exitCodeFor", () => {
  it("returns 0 when every case passed", () => {
    expect(exitCodeFor(makeResult({ failCount: 0, passCount: 2 }))).toBe(0);
  });

  it("returns 1 when at least one case failed", () => {
    expect(exitCodeFor(makeResult({ failCount: 1 }))).toBe(1);
  });
});
