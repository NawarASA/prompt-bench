import fs from "node:fs";
import yaml from "js-yaml";
import type { Assertion, Suite, SuiteCase } from "./types";

export class SuiteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuiteValidationError";
  }
}

const DEFAULT_MODEL = "claude-sonnet-5";
const ASSERTION_TYPES = new Set([
  "contains",
  "not_contains",
  "regex",
  "max_length",
  "min_length",
  "json_valid",
  "judge",
]);

function fail(path: string, detail: string): never {
  throw new SuiteValidationError(`${path}: ${detail}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssertion(raw: unknown, path: string): Assertion {
  if (!isPlainObject(raw)) {
    fail(path, "must be an object with at least a `type` field");
  }

  const type = raw.type;
  if (typeof type !== "string" || !ASSERTION_TYPES.has(type)) {
    fail(
      path,
      `unknown assertion type ${JSON.stringify(type)} (expected one of ${[...ASSERTION_TYPES].join(", ")})`
    );
  }

  switch (type) {
    case "contains":
    case "not_contains": {
      if (typeof raw.value !== "string") {
        fail(`${path}.value`, `"${type}" assertions require a string \`value\``);
      }
      return { type, value: raw.value };
    }

    case "regex": {
      if (typeof raw.pattern !== "string") {
        fail(`${path}.pattern`, `"regex" assertions require a string \`pattern\``);
      }
      if (raw.flags !== undefined && typeof raw.flags !== "string") {
        fail(`${path}.flags`, `"flags" must be a string if provided`);
      }
      return { type: "regex", pattern: raw.pattern, flags: raw.flags as string | undefined };
    }

    case "max_length":
    case "min_length": {
      if (typeof raw.value !== "number") {
        fail(`${path}.value`, `"${type}" assertions require a numeric \`value\``);
      }
      return { type, value: raw.value };
    }

    case "json_valid":
      return { type: "json_valid" };

    case "judge": {
      if (typeof raw.rubric !== "string" || raw.rubric.trim() === "") {
        fail(`${path}.rubric`, `"judge" assertions require a non-empty string \`rubric\``);
      }
      if (raw.threshold !== undefined) {
        if (typeof raw.threshold !== "number" || raw.threshold < 0 || raw.threshold > 1) {
          fail(`${path}.threshold`, `"threshold" must be a number between 0 and 1`);
        }
      }
      return { type: "judge", rubric: raw.rubric, threshold: raw.threshold as number | undefined };
    }

    default:
      fail(path, `unhandled assertion type ${JSON.stringify(type)}`);
  }
}

function parseCase(raw: unknown, index: number): SuiteCase {
  const path = `cases[${index}]`;
  if (!isPlainObject(raw)) {
    fail(path, "must be an object");
  }

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    fail(`${path}.name`, "is required and must be a non-empty string");
  }
  if (typeof raw.prompt !== "string" || raw.prompt.trim() === "") {
    fail(`${path}.prompt`, "is required and must be a non-empty string");
  }
  if (raw.system !== undefined && typeof raw.system !== "string") {
    fail(`${path}.system`, "must be a string if provided");
  }
  if (!Array.isArray(raw.assertions) || raw.assertions.length === 0) {
    fail(`${path}.assertions`, "is required and must be a non-empty array");
  }

  const assertions = raw.assertions.map((a, i) => parseAssertion(a, `${path}.assertions[${i}]`));

  return {
    name: raw.name,
    prompt: raw.prompt,
    system: raw.system as string | undefined,
    assertions,
  };
}

/** Parses and validates an already-loaded suite document (e.g. from js-yaml). */
export function parseSuite(raw: unknown): Suite {
  if (!isPlainObject(raw)) {
    fail("suite", "top-level document must be an object with `cases` (and optionally `model`, `system`)");
  }

  if (raw.model !== undefined && typeof raw.model !== "string") {
    fail("model", "must be a string if provided");
  }
  if (raw.system !== undefined && typeof raw.system !== "string") {
    fail("system", "must be a string if provided");
  }
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    fail("cases", "is required and must be a non-empty array");
  }

  const names = new Set<string>();
  const cases = raw.cases.map((c, i) => {
    const parsed = parseCase(c, i);
    if (names.has(parsed.name)) {
      fail(`cases[${i}].name`, `duplicate case name "${parsed.name}" - case names must be unique`);
    }
    names.add(parsed.name);
    return parsed;
  });

  return {
    model: (raw.model as string | undefined) ?? DEFAULT_MODEL,
    system: raw.system as string | undefined,
    cases,
  };
}

/** Reads a suite YAML file from disk, parses it, and validates its structure. */
export function loadSuite(filePath: string): Suite {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new SuiteValidationError(`could not read suite file "${filePath}": ${(err as Error).message}`);
  }

  let doc: unknown;
  try {
    doc = yaml.load(text);
  } catch (err) {
    throw new SuiteValidationError(`could not parse "${filePath}" as YAML: ${(err as Error).message}`);
  }

  return parseSuite(doc);
}
