import chalk from "chalk";
import type { CaseResult, SuiteRunResult } from "./types";

function statusLabel(result: CaseResult): string {
  return result.passed ? chalk.bold.green("PASS") : chalk.bold.red("FAIL");
}

function formatCase(result: CaseResult): string {
  const lines = [`${statusLabel(result)} ${result.name} ${chalk.dim(`(${result.durationMs}ms)`)}`];

  if (result.error) {
    lines.push(chalk.red(`     error: ${result.error}`));
    return lines.join("\n");
  }

  for (const assertion of result.assertions) {
    if (assertion.passed) {
      lines.push(chalk.dim(`     ✓ [${assertion.assertion.type}] ${assertion.message}`));
    } else {
      lines.push(chalk.red(`     ✗ [${assertion.assertion.type}] ${assertion.message}`));
    }
  }

  return lines.join("\n");
}

/** Renders a human-readable results table with per-case pass/fail detail. */
export function formatTable(result: SuiteRunResult): string {
  const lines = [chalk.bold(`\nRunning ${result.results.length} case(s) against ${result.suiteModel}\n`)];

  for (const caseResult of result.results) {
    lines.push(formatCase(caseResult));
    lines.push("");
  }

  const summaryColor = result.failCount === 0 ? chalk.bold.green : chalk.bold.red;
  lines.push(
    summaryColor(`${result.passCount} passed, ${result.failCount} failed`) +
      chalk.dim(` (${result.durationMs}ms)`)
  );

  return lines.join("\n");
}

/** Renders results as machine-readable JSON (no color codes). */
export function formatJson(result: SuiteRunResult): string {
  return JSON.stringify(
    {
      model: result.suiteModel,
      passCount: result.passCount,
      failCount: result.failCount,
      durationMs: result.durationMs,
      cases: result.results.map((c) => ({
        name: c.name,
        passed: c.passed,
        durationMs: c.durationMs,
        error: c.error,
        assertions: c.assertions.map((a) => ({
          type: a.assertion.type,
          passed: a.passed,
          message: a.message,
        })),
      })),
    },
    null,
    2
  );
}

/** CI-friendly exit code: 0 only when every case passed. */
export function exitCodeFor(result: SuiteRunResult): 0 | 1 {
  return result.failCount === 0 ? 0 : 1;
}
