import { createAnthropic } from "@ai-sdk/anthropic";

export interface AgentProvider {
  model: ReturnType<ReturnType<typeof createAnthropic>>;
}

export function createAgentProvider(
  proxyUrl: string,
  apiKey: string,
): AgentProvider {
  const anthropic = createAnthropic({
    baseURL: proxyUrl,
    apiKey,
    headers: {
      "anthropic-dangerous-direct-browser-access": "true",
      "x-extension-origin": chrome.runtime.id,
    },
  });
  return { model: anthropic("claude-3-5-sonnet-latest") };
}