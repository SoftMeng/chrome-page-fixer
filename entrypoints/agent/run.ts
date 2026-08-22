import { generateText, stepCountIs, type ModelMessage } from "ai";
import { createAgentProvider } from "./provider";
import { buildAgentTools, type ToolContext } from "./tools";
import { envelopeForRefs } from "../shared/chat-prompt";
import type { ErrorEntry } from "../shared/types";

export interface AgentRunInput {
  proxyUrl: string;
  apiKey: string;
  system: string;
  history: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    refs: string[];
    timestamp: number;
  }>;
  userContent: string;
  refs: ErrorEntry[];
  ctx: ToolContext;
  maxSteps?: number;
}

export interface AgentRunResult {
  ok: true;
  content: string;
}

export interface AgentRunError {
  ok: false;
  error: string;
}

export type AgentRunOutcome = AgentRunResult | AgentRunError;

export async function runAgentWithTools(
  input: AgentRunInput,
): Promise<AgentRunOutcome> {
  try {
    const { model } = createAgentProvider(input.proxyUrl, input.apiKey);
    const tools = buildAgentTools(input.ctx);

    const messages: ModelMessage[] = buildMessages(
      input.history,
      input.refs,
      input.userContent,
    );

    const result = await generateText({
      model,
      system: input.system,
      messages,
      tools,
      stopWhen: stepCountIs(input.maxSteps ?? 5),
    });

    return { ok: true, content: result.text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "analyze failed" };
  }
}

function buildMessages(
  history: AgentRunInput["history"],
  refs: ErrorEntry[],
  userContent: string,
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  if (refs.length > 0) {
    messages.push({ role: "user", content: envelopeForRefs(refs) });
  }

  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({ role: "user", content: userContent });
  return messages;
}