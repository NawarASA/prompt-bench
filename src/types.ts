export interface AssertionContains {
  type: "contains";
  value: string;
}

export interface AssertionNotContains {
  type: "not_contains";
  value: string;
}

export interface AssertionRegex {
  type: "regex";
  pattern: string;
  flags?: string;
}

export interface AssertionMaxLength {
  type: "max_length";
  value: number;
}

export interface AssertionMinLength {
  type: "min_length";
  value: number;
}

export interface AssertionJsonValid {
  type: "json_valid";
}

export interface AssertionJudge {
  type: "judge";
  rubric: string;
  threshold?: number;
}

export type Assertion =
  | AssertionContains
  | AssertionNotContains
  | AssertionRegex
  | AssertionMaxLength
  | AssertionMinLength
  | AssertionJsonValid
  | AssertionJudge;

export type AssertionType = Assertion["type"];

export interface SuiteCase {
  name: string;
  prompt: string;
  system?: string;
  assertions: Assertion[];
}

export interface Suite {
  model: string;
  system?: string;
  cases: SuiteCase[];
}

/**
 * Minimal seam over the Anthropic client so the runner (and the judge
 * assertion, which itself makes a second model call) can be unit tested by
 * injecting a stub that returns scripted text, with no SDK module-mocking
 * required and no real network calls.
 */
export interface ChatClient {
  complete(input: { model: string; system?: string; prompt: string }): Promise<string>;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  message: string;
}

export interface CaseResult {
  name: string;
  prompt: string;
  passed: boolean;
  response?: string;
  error?: string;
  assertions: AssertionResult[];
  durationMs: number;
}

export interface SuiteRunResult {
  suiteModel: string;
  results: CaseResult[];
  passCount: number;
  failCount: number;
  durationMs: number;
}
