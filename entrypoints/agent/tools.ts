import { tool } from "ai";
import { z } from "zod";
import type { ErrorEntry, ErrorKind, ErrorLevel } from "../shared/types";
import { getErrors as getErrorsFn, type GetErrorsInput } from "../shared/tools/get-errors";
import { getErrorByIndex as getErrorByIndexFn } from "../shared/tools/get-error-by-index";
import { searchErrors as searchErrorsFn } from "../shared/tools/search-errors";
import {
  validateSelector,
  type InspectElementInput,
  type InspectElementResult,
} from "../shared/tools/inspect-element";
import type {
  ListElementsInput,
  ListElementsResult,
  ListMode,
} from "../shared/tools/list-elements";
import {
  readConsoleEntries,
  type ConsoleEntry,
} from "../shared/console-buffer";
import {
  readNetworkEntries,
  type NetworkEntry,
} from "../shared/network-buffer";
import type {
  GetConsoleMessagesInput,
  GetConsoleMessagesResult,
} from "../shared/tools/get-console-messages";
import type {
  GetNetworkLogInput,
  GetNetworkLogResult,
} from "../shared/tools/get-network-log";
import type {
  GetResourceTimingInput,
  GetResourceTimingResult,
  ResourceTimingItem,
} from "../shared/tools/get-resource-timing";
import type {
  GetComputedStyleInput,
  GetComputedStyleResult,
} from "../shared/tools/get-computed-style";
import type {
  GetStorageSnapshotInput,
  GetStorageSnapshotResult,
} from "../shared/tools/get-storage-snapshot";
import type {
  GetEventListenersInput,
  GetEventListenersResult,
} from "../shared/tools/get-event-listeners";
import type {
  GetPageDomHtmlInput,
  GetPageDomHtmlResult,
} from "../shared/tools/get-page-dom-html";
import type {
  NavigationTimingResult,
} from "../shared/tools/get-navigation-timing";

export interface ToolContext {
  buffer: ErrorEntry[];
  hashToNumber: Map<string, number>;
  inspectElement: (input: InspectElementInput) => Promise<InspectElementResult>;
  listElements: (
    input: ListElementsInput,
  ) => Promise<ListElementsResult>;
  readResourceTiming: () => Promise<ResourceTimingItem[]>;
  getComputedStyle: (input: GetComputedStyleInput) => Promise<GetComputedStyleResult>;
  getStorage: (input: GetStorageSnapshotInput) => Promise<GetStorageSnapshotResult>;
  getEventListeners: (input: GetEventListenersInput) => Promise<GetEventListenersResult>;
  getPageDomHtml: (input: GetPageDomHtmlInput) => Promise<GetPageDomHtmlResult>;
  getNavigationTiming: () => Promise<NavigationTimingResult>;
}

const ERROR_KIND = z.enum([
  "console",
  "uncaught",
  "unhandledrejection",
  "resource-load",
  "network",
]);
const ERROR_LEVEL = z.enum(["info", "warn", "error"]);

export function buildAgentTools(ctx: ToolContext) {
  return {
    get_errors: tool({
      description:
        "返回当前缓冲里已经捕获的错误条目，按时间倒序。可选按 kind / level 过滤，或按 query 在 message / elementSummary / selector 字段上做不区分大小写的子串匹配。query 与 kind / level 可同时使用（AND 关系）。limit 上限 50。",
      inputSchema: z.object({
        kind: ERROR_KIND.optional(),
        level: ERROR_LEVEL.optional(),
        query: z.string().min(1).max(64).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input): Promise<ErrorEntry[]> => {
        if (input.query) {
          return searchErrorsFn(ctx.buffer, {
            query: input.query,
            limit: input.limit,
          });
        }
        const out = getErrorsFn(ctx.buffer, {
          kind: input.kind as ErrorKind | undefined,
          level: input.level as ErrorLevel | undefined,
          limit: input.limit,
        } satisfies GetErrorsInput);
        return out;
      },
    }),
    get_error_by_index: tool({
      description:
        "通过错误编号 #N（用户在错误列表里看到的稳定索引）反查完整的 ErrorEntry 对象。找不到时返回 null。",
      inputSchema: z.object({
        index: z.number().int().min(1),
      }),
      execute: async (input): Promise<ErrorEntry | null> => {
        return getErrorByIndexFn(ctx.buffer, ctx.hashToNumber, input.index);
      },
    }),
    inspect_element: tool({
      description:
        "用 CSS selector 查询当前活动页面的单个元素：返回 tag / id / class / 受限 attribute 白名单 / bounding rect / 是否可见 / 前 3 层祖先 selector。textContent / innerHTML / value 等敏感字段不会返回。",
      inputSchema: z.object({
        selector: z.string().min(1).max(256),
      }),
      execute: async (input): Promise<InspectElementResult> => {
        try {
          validateSelector(input.selector);
        } catch (err) {
          const message = err instanceof Error ? err.message : "invalid selector";
          return { selector: input.selector, found: false, error: message };
        }
        return ctx.inspectElement({ selector: input.selector });
      },
    }),
    list_elements: tool({
      description:
        "查 DOM 元素。两种模式：mode='flat'（默认）= 在 selector 容器下查一类元素（不能是 html / body / *），返回总数 + 摘要列表；mode='tree' = 拿 selector 或 body 的 DOM 骨架（tag / id / class / 截前 20 字符 text），depth 控制展开层数（默认 4，上限 6，节点上限 500）。",
      inputSchema: z.object({
        selector: z.string().min(1).max(256).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        depth: z.number().int().min(1).max(6).optional(),
        mode: z.enum(["flat", "tree"]).optional(),
      }),
      execute: async (input): Promise<ListElementsResult> => {
        const mode: ListMode = input.mode === "tree" ? "tree" : "flat";
        if (mode === "flat" && (!input.selector || input.selector.length === 0)) {
          return {
            selector: "",
            total: 0,
            returned: 0,
            truncated: false,
            mode,
            depth: 1,
            items: [],
            error: "flat mode requires selector",
          };
        }
        if (mode === "flat" && input.selector) {
          try {
            validateSelector(input.selector);
          } catch (err) {
            const message = err instanceof Error ? err.message : "invalid selector";
            return {
              selector: input.selector,
              total: 0,
              returned: 0,
              truncated: false,
              mode,
              depth: 1,
              items: [],
              error: message,
            };
          }
        }
        return ctx.listElements({
          selector: input.selector,
          limit: input.limit,
          depth: input.depth,
          mode,
        });
      },
    }),
    get_console_messages: tool({
      description:
        "返回 Content Script 捕获的浏览器 console 历史（log / info / warn / error）。按 level 过滤；limit 上限 100；sinceMs 只返回近 N 毫秒内的。",
      inputSchema: z.object({
        level: z.enum(["log", "info", "warn", "error", "all"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        sinceMs: z.number().int().min(0).optional(),
      }),
      execute: async (input): Promise<GetConsoleMessagesResult> => {
        let entries: ConsoleEntry[] = readConsoleEntries();
        if (input.level && input.level !== "all") {
          entries = entries.filter((e) => e.level === input.level);
        }
        if (typeof input.sinceMs === "number") {
          const cutoff = Date.now() - input.sinceMs;
          entries = entries.filter((e) => e.timestamp >= cutoff);
        }
        const limit = typeof input.limit === "number" ? input.limit : 50;
        const sliced = entries.slice(-limit);
        return { entries: sliced };
      },
    }),
    get_network_log: tool({
      description:
        "返回 webRequest 捕获的网络请求历史（最近 100 条）。按 kind（network / resource-load）和 minStatus 过滤；limit 上限 100。",
      inputSchema: z.object({
        kind: z.enum(["network", "resource-load"]).optional(),
        minStatus: z.number().int().min(100).max(599).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input): Promise<GetNetworkLogResult> => {
        let entries: NetworkEntry[] = readNetworkEntries();
        if (input.kind) entries = entries.filter((e) => e.kind === input.kind);
        if (typeof input.minStatus === "number") {
          entries = entries.filter((e) => e.status >= input.minStatus!);
        }
        const limit = typeof input.limit === "number" ? input.limit : 50;
        return { entries: entries.slice(-limit) };
      },
    }),
    get_resource_timing: tool({
      description:
        "用浏览器 PerformanceObserver Resource Timing API 拿当前活动页加载的资源耗时（按 initiatorType 过滤 script / css / image / fetch / xmlhttprequest；limit 上限 50）。",
      inputSchema: z.object({
        type: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input): Promise<GetResourceTimingResult> => {
        const all = await ctx.readResourceTiming();
        let items = all;
        if (input.type) items = items.filter((i) => i.initiatorType === input.type);
        const limit = typeof input.limit === "number" ? input.limit : 50;
        const sliced = items.slice(-limit);
        return { items: sliced };
      },
    }),
    get_computed_style: tool({
      description:
        "查某个元素的计算样式（getComputedStyle）。缺省返回 12 个常用属性（display / visibility / opacity / position / z-index / width / height / padding / margin / color / background-color / font-size）；properties 最多指定 10 个。",
      inputSchema: z.object({
        selector: z.string().min(1).max(256),
        properties: z.array(z.string().min(1).max(64)).max(10).optional(),
      }),
      execute: async (input): Promise<GetComputedStyleResult> => {
        try {
          validateSelector(input.selector);
        } catch (err) {
          const message = err instanceof Error ? err.message : "invalid selector";
          return { selector: input.selector, found: false, styles: {}, error: message };
        }
        return ctx.getComputedStyle({ selector: input.selector, properties: input.properties });
      },
    }),
    get_storage_snapshot: tool({
      description:
        "读当前活动 tab 的 localStorage / sessionStorage 键值快照。默认 value 全脱敏为 '***'；properties 数组逐键点名 → 该键 value 原样返回（截前 200 字符）。scope: local | session，缺省 local。键数上限 50。",
      inputSchema: z.object({
        scope: z.enum(["local", "session"]).optional(),
        properties: z.array(z.string().min(1).max(128)).max(50).optional(),
      }),
      execute: async (input): Promise<GetStorageSnapshotResult> => {
        return ctx.getStorage({ scope: input.scope, properties: input.properties });
      },
    }),
    get_event_listeners: tool({
      description:
        "启发式查元素事件监听（不需 debugger 权限，不触发 Chrome 调试提示）。返回 ① 元素 inline on* 属性（如 onclick=...） ② Content Script 安装后捕获到的该元素事件记录。**不能**识别 addEventListener 绑定的事件、React/Vue 虚拟事件系统——limits 字段列在返回值里。eventTypes 可选过滤（如 ['click', 'submit']）。",
      inputSchema: z.object({
        selector: z.string().min(1).max(256),
        eventTypes: z.array(z.string().min(1).max(32)).max(20).optional(),
      }),
      execute: async (input): Promise<GetEventListenersResult> => {
        try {
          validateSelector(input.selector);
        } catch (err) {
          const message = err instanceof Error ? err.message : "invalid selector";
          return { selector: input.selector, found: false, inline: [], capturedTriggers: [], limitations: [], error: message };
        }
        return ctx.getEventListeners({ selector: input.selector, eventTypes: input.eventTypes });
      },
    }),
    get_page_dom_html: tool({
      description:
        "读当前活动页 documentElement.outerHTML（运行时 DOM 序列化结果，**不是**源代码 / 编译产物原始字节）。maxLength 默认 8000 字符，上限 30000。可能含用户输入 / token / 表单 value ——请审查后使用。",
      inputSchema: z.object({
        maxLength: z.number().int().min(1).max(30000).optional(),
      }),
      execute: async (input): Promise<GetPageDomHtmlResult> => {
        return ctx.getPageDomHtml({ maxLength: input.maxLength });
      },
    }),
    get_navigation_timing: tool({
      description:
        "读当前活动页的 PerformanceNavigationTiming 关键指标：duration / domInteractive / domContentLoaded / loadComplete / ttfb / redirect / dns / tcp / tls / serverResponse + 可选 fcp（First Contentful Paint）。纯 read，无参数。跨域资源 transferSize 会为 0，会附 note 字段提示。",
      inputSchema: z.object({}),
      execute: async (): Promise<NavigationTimingResult> => {
        return ctx.getNavigationTiming();
      },
    }),
  };
}