# Tool 设计原则

## Tool 分类

| 分类 | 默认状态 | 示例 |
| --- | --- | --- |
| 只读 | 默认开放 | `get_console_errors`、`get_page_info`、`get_dom_snapshot`、`query_selector`、`get_computed_style`、`search_in_page`、`take_screenshot` |
| 写 | 默认关闭 | `click`、`type`、`scroll`、`select_option`、`fill_form` |
| 调试辅助 | 默认关闭 | `execute_js`、`highlight_element`、`get_local_storage` |

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