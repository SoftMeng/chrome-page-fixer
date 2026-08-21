# Agent 操作安全

## 操作授权

- **域名白名单**：写操作 Tool 必须配置 `allowed_origins`，未列入则拒绝执行。
- **会话级授权**：每次 Agent 会话开始时由用户确认一次会话范围。
- **二次确认**：所有 `sensitive` 级别操作（提交、删除、支付、跨域跳转、登录态表单）在 Side Panel 弹窗确认。
- **操作日志**：所有写操作写入本地审计日志（时间、Tool、参数摘要、结果摘要），不离开本机。

## prompt injection 缓解

- 限制 Agent 可访问的页面/域，避免直接把不受信任的页面文本作为指令。
- 涉及敏感动作必须人工确认（参考 Anthropic 对 Claude in Chrome 的安全建议）。
- 监控提示词来源，对异常长 prompt / 异常指令模板告警。
- Agent 的指令与工具调用分离：禁止把页面文本自动拼接到系统提示中。

## 高风险场景默认禁止

| 场景 | 默认行为 | 例外条件 |
| --- | --- | --- |
| 跨域 iframe | 禁止操作 | 用户针对该 iframe 显式授权 |
| 登录态表单 | 禁止提交 | 用户在 Side Panel 二次确认 |
| 支付/结算页 | 禁止任何写操作 | 禁止例外 |
| 银行/强 CSP 后台 | 禁止主世界注入 | 注入失败时降级为只读 |

## 自动行为限制

- 禁止“无上限自动重试直到成功”。
- 同一 Tool 在同一会话中失败 ≥ 3 次应暂停并请求用户介入。
- 长任务（> 30s）必须放入 Offscreen Document，并提供取消入口。

## 紧急停止

- 任何时候提供“一键停用 Agent”入口，立即终止会话并撤销当前操作的 pending 状态。
- 停用后必须保留最近一次操作日志供事后审查。

## 出处

- 操作授权与安全：`docs/qa/in-browser-agent-extension-plan.md` §5。
- prompt injection 与 Anthropic 安全建议：`docs/qa/claude-in-chrome-alternatives.md` §3.3、`docs/qa/in-browser-agent-extension-plan.md` §3.3。
- 写操作可靠性与高风险操作：`docs/qa/extension-pitfalls-and-best-practices.md` §3.3。