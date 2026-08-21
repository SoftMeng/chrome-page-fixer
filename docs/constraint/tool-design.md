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

`inspect_element` 数据来源：content script (MAIN world) `document.querySelector`，权限 0。
白名单 attribute：`id / class / role / type / name / href / disabled / hidden / aria-label / aria-hidden / aria-disabled / data-testid / data-action / data-id / data-state`。
**不返回**：`textContent` / `value` / `innerHTML` / `outerHTML` / 任何非白名单 attribute（避免敏感数据泄漏）。
调用方：仅 Service Worker 的 tool runner loop；不允许 content script 直接调用。
桥接：background → `chrome.tabs.sendMessage(INSPECT_ELEMENT)` → ISOLATED content → `window.postMessage` → MAIN content → 反向链返回。`chrome.tabs.sendMessage` 1 秒超时。

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