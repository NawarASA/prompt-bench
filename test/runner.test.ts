import { describe, it, expect } from "vitest";
import { runSuite } from "../src/runner";
import type { ChatClient, Suite } from "../src/types";

/** Fake ChatClient that answers by prompt substring, so different cases in a suite get different responses. */
function scriptedClient(responses: Record<string, string>): ChatClient {
  return {
    complete: async ({ prompt }) => {
      const key = Object.keys(responses).find((k) => prompt.includes(k));
      if (!key) {
        throw new Error(`no scripted response for prompt: ${prompt}`);
      }
      return responses[key];
    },
  };
}

describe("runSuite", () => {
  it("runs every case and aggregates pass/fail counts", async () => {
    const suite: Suite = {
      model: "claude-sonnet-5",
      cases: [
        {
          name: "greeting",
          prompt: "say hi politely",
          assertions: [{ type: "contains", value: "hello" }],
        },
        {
          name: "farewell",
          prompt: "say bye politely",
          assertions: [{ type: "contains", value: "goodbye" }],
        },
      ],
    };

    const client = scriptedClient({
      "say hi politely": "Hello there!",
      "say bye politely": "See you later!", // does not contain "goodbye" -> fails
    });

    const result = await runSuite({ client, suite });

    expect(result.results).toHaveLength(2);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);

    const greeting = result.results.find((r) => r.name === "greeting")!;
    expect(greeting.passed).toBe(true);

    const farewell = result.results.find((r) => r.name === "farewell")!;
    expect(farewell.passed).toBe(false);
    expect(farewell.assertions[0].passed).toBe(false);
  });

  it("filters cases by name substring", async () => {
    const suite: Suite = {
      model: "claude-sonnet-5",
      cases: [
        { name: "alpha case", prompt: "a", assertions: [{ type: "min_length", value: 0 }] },
        { name: "beta case", prompt: "b", assertions: [{ type: "min_length", value: 0 }] },
      ],
    };
    const client = scriptedClient({ a: "response a", b: "response b" });

    const result = await runSuite({ client, suite, filter: "alpha" });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe("alpha case");
  });

  it("records a case-level error instead of throwing when the client rejects", async () => {
    const suite: Suite = {
      model: "claude-sonnet-5",
      cases: [{ name: "broken", prompt: "trigger error", assertions: [{ type: "json_valid" }] }],
    };
    const client: ChatClient = {
      complete: async () => {
        throw new Error("API unavailable");
      },
    };

    const result = await runSuite({ client, suite });

    expect(result.failCount).toBe(1);
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].error).toBe("API unavailable");
  });

  it("respects a per-case system prompt override and falls back to the suite system prompt", async () => {
    const seenSystems: (string | undefined)[] = [];
    const suite: Suite = {
      model: "claude-sonnet-5",
      system: "suite-level system",
      cases: [
        {
          name: "override",
          prompt: "p1",
          system: "case-level system",
          assertions: [{ type: "min_length", value: 0 }],
        },
        { name: "fallback", prompt: "p2", assertions: [{ type: "min_length", value: 0 }] },
      ],
    };
    const client: ChatClient = {
      complete: async ({ system }) => {
        seenSystems.push(system);
        return "ok";
      },
    };

    await runSuite({ client, suite, concurrency: 1 });

    expect(seenSystems).toContain("case-level system");
    expect(seenSystems).toContain("suite-level system");
  });

  it("respects a concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const suite: Suite = {
      model: "claude-sonnet-5",
      cases: Array.from({ length: 6 }, (_, i) => ({
        name: `case-${i}`,
        prompt: `p${i}`,
        assertions: [{ type: "min_length" as const, value: 0 }],
      })),
    };
    const client: ChatClient = {
      complete: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return "ok";
      },
    };

    await runSuite({ client, suite, concurrency: 2 });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
