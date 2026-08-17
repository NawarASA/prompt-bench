# prompt-bench

A CLI eval/regression-testing harness for prompt engineering. Define a suite of test cases in YAML - a prompt plus one or more assertions about the expected Claude response - run the suite against the real Claude API, and get a pass/fail report with diffs for every failure. It's the kind of tool an LLM/AI engineering team runs in CI to catch prompt regressions before they ship.

## How it works

1. **You write a suite file.** Each case is a prompt (and optional system prompt) plus a list of assertions - substring checks, regex, length bounds, JSON validity, or an LLM-as-judge rubric scored by a second Claude call.
2. **`prompt-bench run` sends every case to Claude** (with a configurable concurrency limit) and evaluates each case's assertions against the real response.
3. **You get a results table** - pass/fail per case, and for every failed assertion, exactly what was expected versus what the response actually contained.
4. **It exits non-zero on any failure**, so it plugs straight into CI as a regression gate on your prompts.

The runner and every assertion type talk to a minimal `ChatClient` interface (`{ complete(input): Promise<string> }`), not the Anthropic SDK directly - see [`src/types.ts`](src/types.ts) and [`src/ai.ts`](src/ai.ts). That's the seam that lets the whole test suite run against a scripted fake client with zero real API calls.

## Install

```bash
npm install
```

## Usage

```bash
node bin/prompt-bench.js run <suite.yaml> [options]
```

| Flag | Description |
| --- | --- |
| `--filter <substring>` | only run cases whose name includes this substring |
| `--json` | emit machine-readable JSON instead of the results table |
| `--concurrency <n>` | max number of cases to run in parallel (default `3`) |

Needs `ANTHROPIC_API_KEY` set (copy `.env.example` to `.env` and fill it in, or export it in your shell). Get a key at [console.anthropic.com](https://console.anthropic.com/).

### Example suite

[`examples/basic-suite.yaml`](examples/basic-suite.yaml):

```yaml
model: claude-sonnet-5

cases:
  - name: "declines a meeting politely"
    prompt: "Write a one-sentence reply declining a meeting invite."
    assertions:
      - type: contains
        value: "unable"
      - type: not_contains
        value: "sorry sorry"
      - type: max_length
        value: 200
      - type: regex
        pattern: "^[A-Z]"

  - name: "extracts structured data as JSON"
    prompt: >
      Extract the name and age from this sentence as JSON with keys "name" and "age":
      "Maria is 29 years old and works as a data engineer."
      Respond with ONLY the JSON object, no commentary.
    assertions:
      - type: json_valid
      - type: contains
        value: "Maria"
      - type: contains
        value: "29"
```

See also [`examples/customer-support-suite.yaml`](examples/customer-support-suite.yaml), which uses a suite-level `system` prompt and the `judge` assertion type to grade tone and refusal behavior.

### Example run

```
$ node bin/prompt-bench.js run examples/basic-suite.yaml

Running 4 case(s) against claude-sonnet-5

PASS declines a meeting politely (1102ms)
     ✓ [contains] response contains "unable"
     ✓ [not_contains] response does not contain "sorry sorry"
     ✓ [max_length] response length 52 <= 200
     ✓ [regex] response matches /^[A-Z]/

PASS extracts structured data as JSON (987ms)
     ✓ [json_valid] response parses as valid JSON
     ✓ [contains] response contains "Maria"
     ✓ [contains] response contains "29"

FAIL refuses to give financial advice (843ms)
     ✗ [not_contains] expected response NOT to contain "yes, do it" (case-insensitive), but it did
     ✓ [min_length] response length 49 >= 20

PASS keeps a haiku to three lines (1286ms)
     ✓ [max_length] response length 66 <= 300
     ✓ [min_length] response length 66 >= 10

3 passed, 1 failed (4218ms)
```

*(Real terminal output is colorized - green `PASS`/`✓`, red `FAIL`/`✗`. Captured here with color stripped for readability. Exact wording depends on what the model actually returns.)*

`prompt-bench run examples/basic-suite.yaml --json` emits the same results as structured JSON instead, and the process exits with code `1` since one case failed - both are meant for CI.

## Assertion reference

| Type | Fields | Checks |
| --- | --- | --- |
| `contains` | `value` | response contains `value` (case-insensitive substring) |
| `not_contains` | `value` | response does NOT contain `value` (case-insensitive substring) |
| `regex` | `pattern`, `flags?` | response matches the given regular expression |
| `max_length` | `value` | response length (chars) is at most `value` |
| `min_length` | `value` | response length (chars) is at least `value` |
| `json_valid` | — | response parses as valid JSON via `JSON.parse` |
| `judge` | `rubric`, `threshold?` (default `0.7`) | a second Claude call scores the response 0-1 against `rubric`; passes if `score >= threshold` |

## Development

```bash
npm install
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm start          # node bin/prompt-bench.js
```

All 44 tests run with an injected fake `ChatClient` - no real API calls, no SDK mocking. They cover every assertion type's pass/fail logic (including the `judge` type's JSON parsing and code-fence stripping), suite-file parsing and validation (missing fields, unknown assertion types, duplicate case names, out-of-range thresholds), the concurrency-limited runner (filtering, per-case system prompt overrides, error handling when a call rejects), and report formatting/exit-code logic for both the table and `--json` output.

## Project structure

```
src/
  types.ts        shared types: Suite, Assertion variants, ChatClient, results
  suite.ts         YAML suite loading + validation
  assertions.ts     pass/fail logic for every assertion type, incl. the judge call
  runner.ts         runs a suite with filtering + bounded concurrency
  report.ts         table/JSON formatting + CI exit-code logic
  ai.ts             real Anthropic-backed ChatClient
  cli.ts             CLI entrypoint (commander)
bin/prompt-bench.js  executable shim
examples/            sample suite YAML files
test/                vitest suite (fake ChatClient, no network calls)
```

## Why these design choices

- **An injected `ChatClient` interface, not the Anthropic SDK, in the runner and assertions.** Mirrors the pattern in [DayBrief](https://github.com/NawarASA/daybrief)'s agent loop - a one-method interface (`complete`) is trivial to fake with scripted responses, so the entire test suite runs deterministically with zero real API calls.
- **`judge` is just another assertion, not a separate code path.** It reuses the same `ChatClient`, so a fake client can script both the primary response and the judge's score in a single test - see `test/assertions.test.ts`.
- **No build step.** TypeScript runs directly via `tsx`'s require hook, same as the other projects in this set - see `bin/prompt-bench.js`.

## License

MIT - see [LICENSE](LICENSE).
