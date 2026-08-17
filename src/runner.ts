import { evaluateAssertion } from "./assertions";
import type { AssertionResult, CaseResult, ChatClient, Suite, SuiteCase, SuiteRunResult } from "./types";

export interface RunSuiteOptions {
  client: ChatClient;
  suite: Suite;
  filter?: string;
  concurrency?: number;
  onCaseComplete?: (result: CaseResult) => void;
}

const DEFAULT_CONCURRENCY = 3;

function selectCases(suite: Suite, filter?: string): SuiteCase[] {
  if (!filter) {
    return suite.cases;
  }
  const needle = filter.toLowerCase();
  return suite.cases.filter((c) => c.name.toLowerCase().includes(needle));
}

async function runCase(client: ChatClient, suite: Suite, testCase: SuiteCase): Promise<CaseResult> {
  const start = Date.now();

  let response: string;
  try {
    response = await client.complete({
      model: suite.model,
      system: testCase.system ?? suite.system,
      prompt: testCase.prompt,
    });
  } catch (err) {
    return {
      name: testCase.name,
      prompt: testCase.prompt,
      passed: false,
      error: (err as Error).message,
      assertions: [],
      durationMs: Date.now() - start,
    };
  }

  const assertionResults: AssertionResult[] = [];
  for (const assertion of testCase.assertions) {
    assertionResults.push(await evaluateAssertion(assertion, response, client, suite.model));
  }

  return {
    name: testCase.name,
    prompt: testCase.prompt,
    passed: assertionResults.every((a) => a.passed),
    response,
    assertions: assertionResults,
    durationMs: Date.now() - start,
  };
}

/** Runs a bounded number of cases concurrently, preserving input order in the output. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const current = nextIndex++;
    if (current >= items.length) {
      return;
    }
    results[current] = await worker(items[current]);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

export async function runSuite(options: RunSuiteOptions): Promise<SuiteRunResult> {
  const { client, suite } = options;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const cases = selectCases(suite, options.filter);

  const start = Date.now();

  const results = await runWithConcurrency(cases, concurrency, async (testCase) => {
    const result = await runCase(client, suite, testCase);
    options.onCaseComplete?.(result);
    return result;
  });

  const passCount = results.filter((r) => r.passed).length;

  return {
    suiteModel: suite.model,
    results,
    passCount,
    failCount: results.length - passCount,
    durationMs: Date.now() - start,
  };
}
