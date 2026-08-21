import type { ErrorEntry } from "./types";
import { getErrors, type GetErrorsInput } from "./tools/get-errors";
import { getErrorByIndex } from "./tools/get-error-by-index";
import { searchErrors, type SearchErrorsInput } from "./tools/search-errors";
import {
  type InspectElementInput,
  type InspectElementResult,
  validateSelector,
} from "./tools/inspect-element";

export interface ToolContext {
  buffer: ErrorEntry[];
  hashToNumber: Map<string, number>;
  inspectElement: (input: InspectElementInput) => Promise<InspectElementResult>;
}

export type ToolInput = Record<string, unknown>;

export type ToolResult =
  | string
  | number
  | boolean
  | null
  | ErrorEntry
  | ErrorEntry[]
  | InspectElementResult
  | Promise<InspectElementResult>;

export interface ToolDef {
  name: string;
  run: (ctx: ToolContext, input: ToolInput) => ToolResult;
}

function asGetErrors(input: ToolInput): GetErrorsInput {
  return {
    kind: typeof input.kind === "string" ? (input.kind as GetErrorsInput["kind"]) : undefined,
    level: typeof input.level === "string" ? (input.level as GetErrorsInput["level"]) : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
  };
}

function asSearchErrors(input: ToolInput): SearchErrorsInput {
  return {
    query: typeof input.query === "string" ? input.query : "",
    limit: typeof input.limit === "number" ? input.limit : undefined,
  };
}

export const TOOL_REGISTRY: Readonly<Record<string, ToolDef>> = {
  get_errors: {
    name: "get_errors",
    run: (ctx, input) => getErrors(ctx.buffer, asGetErrors(input)),
  },
  get_error_by_index: {
    name: "get_error_by_index",
    run: (ctx, input) => {
      const idx = typeof input.index === "number" ? input.index : NaN;
      return getErrorByIndex(ctx.buffer, ctx.hashToNumber, idx);
    },
  },
  search_errors_by_message: {
    name: "search_errors_by_message",
    run: (ctx, input) => searchErrors(ctx.buffer, asSearchErrors(input)),
  },
  inspect_element: {
    name: "inspect_element",
    run: (ctx, input) => {
      const raw = typeof input.selector === "string" ? input.selector : "";
      let selector: string;
      try {
        selector = validateSelector(raw);
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid selector";
        return { selector: raw, found: false, error: message } satisfies InspectElementResult;
      }
      return ctx.inspectElement({ selector });
    },
  },
};