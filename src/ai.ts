import Anthropic from "@anthropic-ai/sdk";
import type { ChatClient } from "./types";

/**
 * Real Anthropic-backed ChatClient. Kept as a thin adapter so `runner.ts`
 * and `assertions.ts` depend only on the minimal `ChatClient` interface -
 * tests inject a fake implementation instead of this one, so they never
 * touch the network or the SDK.
 */
export function createAnthropicClient(apiKey: string | undefined = process.env.ANTHROPIC_API_KEY): ChatClient {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to a .env file (see .env.example) or export it in your shell."
    );
  }

  const client = new Anthropic({ apiKey });

  return {
    async complete({ model, system, prompt }) {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("The model did not return a text response.");
      }

      return textBlock.text;
    },
  };
}
