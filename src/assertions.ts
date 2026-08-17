import type { Assertion, AssertionResult, ChatClient } from "./types";

const DEFAULT_JUDGE_THRESHOLD = 0.7;

const JUDGE_SYSTEM_PROMPT = `You are a strict grader evaluating whether an AI assistant's response satisfies a rubric. Respond with ONLY valid JSON, no markdown code fences, no commentary before or after, matching exactly this shape:
{"score": number, "reasoning": string}

"score" must be a number between 0 and 1 (1 = fully satisfies the rubric, 0 = does not satisfy it at all). "reasoning" is a one or two sentence explanation of the score.`;

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function buildJudgePrompt(response: string, rubric: string): string {
  return [
    `Rubric: ${rubric}`,
    "",
    "Response to grade:",
    "---",
    response,
    "---",
    "",
    "Score how well the response satisfies the rubric.",
  ].join("\n");
}

async function evaluateJudge(
  assertion: Extract<Assertion, { type: "judge" }>,
  response: string,
  client: ChatClient,
  model: string
): Promise<AssertionResult> {
  const threshold = assertion.threshold ?? DEFAULT_JUDGE_THRESHOLD;

  const raw = await client.complete({
    model,
    system: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(response, assertion.rubric),
  });

  const jsonText = stripCodeFences(raw);
  let parsed: { score?: unknown; reasoning?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { score?: unknown; reasoning?: unknown };
  } catch {
    return {
      assertion,
      passed: false,
      message: `judge did not return valid JSON: ${jsonText}`,
    };
  }

  const score = typeof parsed.score === "number" ? parsed.score : NaN;
  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "(no reasoning given)";

  if (Number.isNaN(score)) {
    return {
      assertion,
      passed: false,
      message: `judge response missing a numeric "score": ${jsonText}`,
    };
  }

  const passed = score >= threshold;
  return {
    assertion,
    passed,
    message: passed
      ? `judge scored ${score.toFixed(2)} (>= ${threshold}): ${reasoning}`
      : `judge scored ${score.toFixed(2)} (< ${threshold}): ${reasoning}`,
  };
}

/**
 * Evaluates a single assertion against a model response. Always async: most
 * assertion types are synchronous checks, but `judge` makes a second model
 * call, and keeping one uniform signature keeps the runner simple.
 */
export async function evaluateAssertion(
  assertion: Assertion,
  response: string,
  client: ChatClient,
  model: string
): Promise<AssertionResult> {
  switch (assertion.type) {
    case "contains": {
      const passed = response.toLowerCase().includes(assertion.value.toLowerCase());
      return {
        assertion,
        passed,
        message: passed
          ? `response contains "${assertion.value}"`
          : `expected response to contain "${assertion.value}" (case-insensitive), but it did not`,
      };
    }

    case "not_contains": {
      const passed = !response.toLowerCase().includes(assertion.value.toLowerCase());
      return {
        assertion,
        passed,
        message: passed
          ? `response does not contain "${assertion.value}"`
          : `expected response NOT to contain "${assertion.value}" (case-insensitive), but it did`,
      };
    }

    case "regex": {
      let regex: RegExp;
      try {
        regex = new RegExp(assertion.pattern, assertion.flags);
      } catch (err) {
        return {
          assertion,
          passed: false,
          message: `invalid regex /${assertion.pattern}/${assertion.flags ?? ""}: ${(err as Error).message}`,
        };
      }
      const passed = regex.test(response);
      return {
        assertion,
        passed,
        message: passed
          ? `response matches /${assertion.pattern}/${assertion.flags ?? ""}`
          : `expected response to match /${assertion.pattern}/${assertion.flags ?? ""}, but it did not`,
      };
    }

    case "max_length": {
      const passed = response.length <= assertion.value;
      return {
        assertion,
        passed,
        message: passed
          ? `response length ${response.length} <= ${assertion.value}`
          : `expected response length <= ${assertion.value}, got ${response.length}`,
      };
    }

    case "min_length": {
      const passed = response.length >= assertion.value;
      return {
        assertion,
        passed,
        message: passed
          ? `response length ${response.length} >= ${assertion.value}`
          : `expected response length >= ${assertion.value}, got ${response.length}`,
      };
    }

    case "json_valid": {
      try {
        JSON.parse(response);
        return { assertion, passed: true, message: "response parses as valid JSON" };
      } catch (err) {
        return {
          assertion,
          passed: false,
          message: `response is not valid JSON: ${(err as Error).message}`,
        };
      }
    }

    case "judge":
      return evaluateJudge(assertion, response, client, model);

    default: {
      const exhaustive: never = assertion;
      return {
        assertion: exhaustive,
        passed: false,
        message: `unknown assertion type`,
      };
    }
  }
}
