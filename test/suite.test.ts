import { describe, it, expect } from "vitest";
import { parseSuite, SuiteValidationError } from "../src/suite";

describe("parseSuite", () => {
  it("parses a minimal valid suite and applies the default model", () => {
    const suite = parseSuite({
      cases: [
        {
          name: "case one",
          prompt: "say hi",
          assertions: [{ type: "contains", value: "hi" }],
        },
      ],
    });

    expect(suite.model).toBe("claude-sonnet-5");
    expect(suite.cases).toHaveLength(1);
    expect(suite.cases[0].name).toBe("case one");
  });

  it("preserves an explicit model and suite-level system prompt", () => {
    const suite = parseSuite({
      model: "claude-haiku-5",
      system: "You are terse.",
      cases: [{ name: "a", prompt: "hi", assertions: [{ type: "json_valid" }] }],
    });

    expect(suite.model).toBe("claude-haiku-5");
    expect(suite.system).toBe("You are terse.");
  });

  it("parses every supported assertion type", () => {
    const suite = parseSuite({
      cases: [
        {
          name: "all-assertions",
          prompt: "hi",
          assertions: [
            { type: "contains", value: "x" },
            { type: "not_contains", value: "y" },
            { type: "regex", pattern: "^x", flags: "i" },
            { type: "max_length", value: 10 },
            { type: "min_length", value: 1 },
            { type: "json_valid" },
            { type: "judge", rubric: "is it good", threshold: 0.8 },
          ],
        },
      ],
    });

    expect(suite.cases[0].assertions).toHaveLength(7);
  });

  it("rejects a non-object top-level document", () => {
    expect(() => parseSuite("not an object")).toThrow(SuiteValidationError);
  });

  it("rejects a suite with no cases", () => {
    expect(() => parseSuite({ cases: [] })).toThrow(/non-empty array/);
  });

  it("rejects a case missing a prompt", () => {
    expect(() =>
      parseSuite({ cases: [{ name: "a", assertions: [{ type: "json_valid" }] }] })
    ).toThrow(/prompt/);
  });

  it("rejects a case with no assertions", () => {
    expect(() => parseSuite({ cases: [{ name: "a", prompt: "hi", assertions: [] }] })).toThrow(
      /non-empty array/
    );
  });

  it("rejects duplicate case names", () => {
    expect(() =>
      parseSuite({
        cases: [
          { name: "dup", prompt: "hi", assertions: [{ type: "json_valid" }] },
          { name: "dup", prompt: "bye", assertions: [{ type: "json_valid" }] },
        ],
      })
    ).toThrow(/duplicate case name/);
  });

  it("rejects an unknown assertion type", () => {
    expect(() =>
      parseSuite({ cases: [{ name: "a", prompt: "hi", assertions: [{ type: "bogus" }] }] })
    ).toThrow(/unknown assertion type/);
  });

  it("rejects a contains assertion missing a value", () => {
    expect(() =>
      parseSuite({ cases: [{ name: "a", prompt: "hi", assertions: [{ type: "contains" }] }] })
    ).toThrow(/require a string `value`/);
  });

  it("rejects a regex assertion missing a pattern", () => {
    expect(() =>
      parseSuite({ cases: [{ name: "a", prompt: "hi", assertions: [{ type: "regex" }] }] })
    ).toThrow(/require a string `pattern`/);
  });

  it("rejects a judge assertion with an out-of-range threshold", () => {
    expect(() =>
      parseSuite({
        cases: [
          {
            name: "a",
            prompt: "hi",
            assertions: [{ type: "judge", rubric: "good?", threshold: 1.5 }],
          },
        ],
      })
    ).toThrow(/between 0 and 1/);
  });

  it("rejects a judge assertion missing a rubric", () => {
    expect(() =>
      parseSuite({ cases: [{ name: "a", prompt: "hi", assertions: [{ type: "judge" }] }] })
    ).toThrow(/non-empty string `rubric`/);
  });
});
