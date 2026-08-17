import { describe, it, expect } from "vitest";
import { evaluateAssertion } from "../src/assertions";
import type { ChatClient } from "../src/types";

function fakeClient(response: string): ChatClient {
  return {
    complete: async () => response,
  };
}

const unusedClient = fakeClient("should not be called");

describe("contains", () => {
  it("passes when the substring is present (case-insensitive)", async () => {
    const result = await evaluateAssertion(
      { type: "contains", value: "UNABLE" },
      "I am unable to attend.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when the substring is absent", async () => {
    const result = await evaluateAssertion(
      { type: "contains", value: "unable" },
      "I will be there.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/expected response to contain/);
  });
});

describe("not_contains", () => {
  it("passes when the substring is absent", async () => {
    const result = await evaluateAssertion(
      { type: "not_contains", value: "sorry sorry" },
      "I am unable to attend, sorry about that.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when the substring is present (case-insensitive)", async () => {
    const result = await evaluateAssertion(
      { type: "not_contains", value: "sorry sorry" },
      "Sorry Sorry, can't make it.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
  });
});

describe("regex", () => {
  it("passes when the pattern matches", async () => {
    const result = await evaluateAssertion(
      { type: "regex", pattern: "^[A-Z]" },
      "Hello there.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when the pattern does not match", async () => {
    const result = await evaluateAssertion(
      { type: "regex", pattern: "^[A-Z]" },
      "hello there.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
  });

  it("respects flags", async () => {
    const result = await evaluateAssertion(
      { type: "regex", pattern: "hello", flags: "i" },
      "HELLO there.",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails gracefully on an invalid pattern instead of throwing", async () => {
    const result = await evaluateAssertion(
      { type: "regex", pattern: "(unterminated" },
      "anything",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/invalid regex/);
  });
});

describe("max_length", () => {
  it("passes when the response is short enough", async () => {
    const result = await evaluateAssertion(
      { type: "max_length", value: 10 },
      "short",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when the response is too long", async () => {
    const result = await evaluateAssertion(
      { type: "max_length", value: 5 },
      "this is far too long",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
  });
});

describe("min_length", () => {
  it("passes when the response is long enough", async () => {
    const result = await evaluateAssertion(
      { type: "min_length", value: 5 },
      "long enough",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails when the response is too short", async () => {
    const result = await evaluateAssertion(
      { type: "min_length", value: 100 },
      "short",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
  });
});

describe("json_valid", () => {
  it("passes for valid JSON", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      '{"name": "Maria", "age": 29}',
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails for invalid JSON", async () => {
    const result = await evaluateAssertion(
      { type: "json_valid" },
      "{name: Maria}",
      unusedClient,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/not valid JSON/);
  });
});

describe("judge", () => {
  it("passes when the judge score meets the threshold", async () => {
    const judge = fakeClient(JSON.stringify({ score: 0.9, reasoning: "Empathetic and on-topic." }));
    const result = await evaluateAssertion(
      { type: "judge", rubric: "Is the response empathetic?", threshold: 0.7 },
      "I'm really sorry to hear that, let's fix it together.",
      judge,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
    expect(result.message).toMatch(/scored 0.90/);
  });

  it("fails when the judge score is below the threshold", async () => {
    const judge = fakeClient(JSON.stringify({ score: 0.3, reasoning: "Dismissive tone." }));
    const result = await evaluateAssertion(
      { type: "judge", rubric: "Is the response empathetic?", threshold: 0.7 },
      "Not my problem.",
      judge,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
  });

  it("defaults the threshold to 0.7 when not specified", async () => {
    const judge = fakeClient(JSON.stringify({ score: 0.65, reasoning: "Close but not quite." }));
    const result = await evaluateAssertion(
      { type: "judge", rubric: "Is the response empathetic?" },
      "meh",
      judge,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
  });

  it("strips markdown code fences from the judge response", async () => {
    const judge = fakeClient('```json\n{"score": 1, "reasoning": "Perfect."}\n```');
    const result = await evaluateAssertion(
      { type: "judge", rubric: "anything", threshold: 0.5 },
      "response text",
      judge,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(true);
  });

  it("fails gracefully when the judge does not return valid JSON", async () => {
    const judge = fakeClient("I think it's pretty good, score 8/10");
    const result = await evaluateAssertion(
      { type: "judge", rubric: "anything", threshold: 0.5 },
      "response text",
      judge,
      "claude-sonnet-5"
    );
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/did not return valid JSON/);
  });
});
