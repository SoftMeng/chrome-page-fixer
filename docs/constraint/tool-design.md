# Tool 设计原则

## Tool 分类

| 分类 | 默认状态 | 示例 |
| --- | --- | --- |
| 只读 | 默认开放 | `get_errors`、`get_error_by_index`、`search_errors_by_message` |
| 写 | 默认关闭 | `click`、`type`、`scroll`、`select_option`、`fill_form` |
| 调试辅助 | 默认关闭 | `execute_js`、`highlight_element`、`get_local_storage` |

## 当前已实现 Tool（Post-MVP 阶段1+2）

| name | input | output | risk_level |
| --- | --- | --- | --- |
| `get_errors` | `{ kind?: ErrorKind, level?: ErrorLevel, limit?: 1..50 }` | `ErrorEntry[]`（按 timestamp 倒序） | `readonly` |
| `get_error_by_index` | `{ index: number }` | `ErrorEntry \| null` | `readonly` |
| `search_errors_by_message` | `{ query: string 1..64, limit?: 1..50 }` | `ErrorEntry[]`（按 timestamp 倒序） | `readonly` |
| `inspect_element` | `{ selector: string 1..256, 拒绝 :root/html/body/* }` | `{found, tag, id, classes, attributes(白名单), rect, visible, ancestorSelector}` | `readonly` |
| `list_elements` | `{selector?, mode: 'flat'|'tree', depth? 1..6, limit? 1..50}` | flat: `{total, returned, truncated, items}`; tree: `{total, returned, truncated, tree}` | `readonly` |
| `get_console_messages` | `{level?, limit? 1..100, sinceMs?}` | `{entries: ConsoleEntry[]}` | `readonly` |
| `get_network_log` | `{kind?, minStatus? 100..599, limit? 1..100}` | `{entries: NetworkEntry[]}` | `readonly` |
| `get_resource_timing` | `{type?, limit? 1..50}` | `{items: ResourceTimingItem[]}`（PerformanceObserver Resource Timing API） | `readonly` |
| `get_computed_style` | `{selector, properties? ≤10}` | `{selector, found, styles: Record<string,string>}` | `readonly` |
| `get_storage_snapshot` | `{scope?, properties? ≤50}` | `{scope, totalKeys, includedKeys, redactedKeys, items}`（默认 value 全脱敏为 '***'） | `readonly` |
| `get_event_listeners` | `{selector, eventTypes? ≤20}` | `{selector, found, inline, capturedTriggers, limitations}`（启发式，**不**识别 addEventListener / 框架虚拟事件） | `readonly` |
| `get_page_dom_html` | `{maxLength? 1..30000, 默认 8000}` | `{url, totalLength, truncated, html, note}`（运行时 DOM 序列化，非源码） | `readonly` |
| `get_navigation_timing` | `{}` | `{available, url?, duration?, domInteractive?, domContentLoaded?, loadComplete?, ttfb?, redirect?, dns?, tcp?, tls?, serverResponse?, fcp?, error?, note?}`（PerformanceNavigationTiming 关键指标） | `readonly` |

`inspect_element` 数据来源：content script (MAIN world) `document.querySelector`，权限 0。
白名单 attribute：`id / class / role / type / name / href / disabled / hidden / aria-label / aria-hidden / aria-disabled / data-testid / data-action / data-id / data-state`。
**不返回**：`textContent` / `value` / `innerHTML` / `outerHTML` / 任何非白名单 attribute（避免敏感数据泄漏）。
调用方：仅 Service Worker 的 tool runner loop；不允许 content script 直接调用。
桥接：background → `chrome.tabs.sendMessage(INSPECT_ELEMENT)` → ISOLATED content → `window.postMessage` → MAIN content → 反向链返回。`chrome.tabs.sendMessage` 1 秒超时。

**`get_navigation_timing` 与 `get_resource_timing` 边界**：
- `get_navigation_timing` = **页面级**耗时（HTML 文档自身），TTFB / DOMContentLoaded / load / FCP
- `get_resource_timing` = **资源级**耗时（script / css / image / fetch 单条）
- 场景对应："页面打开慢" → `get_navigation_timing`；"某个 JS chunk 加载慢" → `get_resource_timing`

## Agent 框架

- **Tool 运行时**：`Vercel AI SDK v7`（`ai` + `@ai-sdk/anthropic` v4），定义用 `tool({description, inputSchema: z.object({...}), execute})`。
- **Loop 控制**：`stopWhen: stepCountIs(5)` —— SDK 内置多步循环，不需手写。
- **zod 校验**：所有 Tool 输入在 SDK 层做 schema 校验，非法输入直接拒，不进入 execute。
- **路径**：Tool schema 与 execute 在 `entrypoints/agent/tools.ts`；纯函数实现保留在 `entrypoints/shared/tools/`（与 schema 解耦，便于单测）。
- **bundle 代价**：Vercel AI SDK 引入 +374 kB（background.js 26 kB → 400 kB）—— 一次性接受换取 L2 决策层能力。

## Tool schema 必填项

每个 Tool 必须有：

- `name`：稳定命名（snake_case）。
- `description`：单句描述目标与典型用法。
- `input`：JSON Schema，标注必填/可选。
- `output`：JSON Schema，包含成功结构与错误结构。
- `risk_level`：`readonly` / `write` / `sensitive`。
- `required_permissions`：执行该 Tool 所需的权限/域。
- `test_page`：用于验证的 URL 或页面文件路径。

## 数量控制

- MVP 总数 ≤ 8。
- 任何超过 8 的新增必须先在 QA 中说明必要性并通过 `harness-decide` 评审。
- 任何 `sensitive` 级别 Tool 必须先经过 `docs/constraint/agent-safety.md` 评审。

## Tool 生命周期

1. 在 `docs/qa/in-browser-agent-extension-plan.md` §4 中登记 MVP Tool 清单。
2. 实现前完成 schema 与权限映射。
3. 实现后提供测试页面，覆盖：成功路径、错误路径、SPA 路由切换、跨域 iframe（若支持）。
4. 在 `docs/qa/README.md` 变更日志中记录新增/弃用。

## 禁止项

- Tool 自动重试直到成功（无上限循环）。
- Tool 直接修改 `localStorage` / `sessionStorage` 中的凭据字段。
- Tool 自动提交任何表单（含搜索框以外的表单）。
- Tool 跨域访问登录态页面（必须由用户明确授权）。

## 出处

- 工具分类与设计要点：`docs/qa/in-browser-agent-extension-plan.md` §3.7、§4。
- 写操作可靠性与高风险操作：`docs/qa/extension-pitfalls-and-best-practices.md` §3.3。