import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { createAnthropicClient } from "./ai";
import { loadSuite, SuiteValidationError } from "./suite";
import { runSuite } from "./runner";
import { formatTable, formatJson, exitCodeFor } from "./report";

const program = new Command();

program.name("prompt-bench").description("Eval/regression-testing harness for prompt engineering.");

program
  .command("run")
  .description("run a suite of test cases against the Claude API")
  .argument("<suite>", "path to a suite YAML file")
  .option("--filter <substring>", "only run cases whose name includes this substring")
  .option("--json", "emit machine-readable JSON instead of the results table")
  .option("--concurrency <n>", "max number of cases to run in parallel", "3")
  .action(async (suitePath: string, opts: { filter?: string; json?: boolean; concurrency: string }) => {
    let suite;
    try {
      suite = loadSuite(suitePath);
    } catch (err) {
      if (err instanceof SuiteValidationError) {
        console.error(chalk.red(`Invalid suite file: ${err.message}`));
      } else {
        console.error(chalk.red((err as Error).message));
      }
      process.exitCode = 1;
      return;
    }

    let client;
    try {
      client = createAnthropicClient();
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exitCode = 1;
      return;
    }

    const concurrency = Math.max(1, parseInt(opts.concurrency, 10) || 1);

    const result = await runSuite({
      client,
      suite,
      filter: opts.filter,
      concurrency,
    });

    if (opts.json) {
      console.log(formatJson(result));
    } else {
      console.log(formatTable(result));
    }

    process.exitCode = exitCodeFor(result);
  });

program.parse();
