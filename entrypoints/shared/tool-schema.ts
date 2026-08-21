interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: ToolSchema[] = [
  {
    name: "get_errors",
    description:
      "返回当前缓冲里已经捕获的错误条目，按时间倒序。可选按 kind (console/uncaught/unhandledrejection/resource-load/network) 与 level (info/warn/error) 过滤，limit 上限 50。",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["console", "uncaught", "unhandledrejection", "resource-load", "network"],
        },
        level: { type: "string", enum: ["info", "warn", "error"] },
        limit: { type: "number", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "get_error_by_index",
    description:
      "通过错误编号 #N（用户在错误列表里看到的稳定索引）反查完整的 ErrorEntry 对象。找不到时返回 null。",
    input_schema: {
      type: "object",
      properties: {
        index: { type: "number", minimum: 1 },
      },
      required: ["index"],
    },
  },
  {
    name: "search_errors_by_message",
    description:
      "在 message / elementSummary / selector 字段上做子串匹配（不区分大小写），返回最近 limit 条结果（上限 50，缺省 10）。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 64 },
        limit: { type: "number", minimum: 1, maximum: 50 },
      },
      required: ["query"],
    },
  },
  {
    name: "inspect_element",
    description:
      "用 CSS selector 查询当前活动页面的单个元素：返回 tag / id / class / 受限 attribute 白名单 / bounding rect / 是否可见 / 前 3 层祖先 selector。textContent / innerHTML / value 等敏感字段不会返回。",
    input_schema: {
      type: "object",
      properties: {
        selector: { type: "string", minLength: 1, maxLength: 256 },
      },
      required: ["selector"],
    },
  },
];