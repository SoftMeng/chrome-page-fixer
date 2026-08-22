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

---

## Debugger 权限评审与写操作 Tool 准入（Post-MVP 阶段 3 补）

> 范围：本节是 `get_event_listeners`（CDP-only，写操作 Tool 类别）启用前必须通过的准入清单；任何新增写操作 Tool（`execute_js` / `click_element` / `type_text` 等）均按此节评审。

### 1. `debugger` 权限 UX 事实

- Chrome MV3：使用 `chrome.debugger` API **必然**在用户当前标签页顶部显示"扩展程序正在调试此浏览器"提示——用户可感知。
- 用户可随时关闭标签页 / 卸载扩展来取消 debugger attach。
- debugger 一旦 attach，扩展在 background 可调用完整 Chrome DevTools Protocol：包括 `Runtime.evaluate`（任意 JS 执行）、`DOM.setOuterHTML`（改 DOM）、`Network.getResponseBody`（读 body）、`Storage.*`（读 cookie / localStorage）。
- **结论**：debugger 是"打开一切"的总闸，不能用具体 Tool 的"只读"属性辩解。

### 2. Tool 分类与准入

| 类别 | 例子 | 默认状态 | 启用条件 |
| --- | --- | --- | --- |
| **只读 / 不需 debugger** | `get_event_listeners` 启发式版（无 CDP） | ✅ 直接可用 | 不需要本节评审 |
| **只读 / 需 debugger** | `get_event_listeners`（CDP `DOM.getEventListeners`）、`Network.getResponseBody` | ❌ 默认禁 | **本节清单 5 项全过**才允许实现 |
| **写 / 不需 debugger** | `click_element` / `type_text` / `el.scrollIntoView()` | ❌ 默认禁 | **本节清单 5 项全过**才允许实现 |
| **写 / 需 debugger** | `Runtime.evaluate` 任意 JS | ❌❌ 默认禁 + 二次封锁 | **本节清单 5 项全过 + 单独 `agent-safety.md` 二次评审**（不适用本研究周期）|

### 3. 启用前必过的 5 项清单（事实 / 必填）

- [ ] **3.1 域名白名单实现** —— `allowed_origins: string[]` 配置项（Options UI 暴露）；调用任何写操作 Tool 前 `URL.origin` ∈ 白名单，否则**拒绝**并向 Side Panel 推送"未授权域名"提示
- [ ] **3.2 二次确认 UI** —— Side Panel 新增"确认执行"组件：显示 Tool 名 / 参数摘要 / 风险等级；用户点"确认"才执行；**超时 30 秒** 自动拒绝
- [ ] **3.3 操作审计日志** —— `chrome.storage.local["audit_log"]`，**append-only** 环形缓冲 1000 条；每条 `{timestamp, toolName, paramsHash, resultSummary, origin}`；扩展页可查看 / 导出（CSV），**不上传**任何位置
- [ ] **3.4 debugger 权限 UX 告知** —— Options UI 启用写操作 Tool 前**必须**勾选"我理解 Chrome 标签页会显示调试提示"；提示文案固定来自本文 §1
- [ ] **3.5 用户一键停用** —— Side Panel 常驻"停用 Agent"按钮，点击后立即（≤100ms）调 `chrome.debugger.detach()` + 清 pending 写操作；**不**等 Tool 跑完

### 4. `get_event_listeners` 准入判断（事实级）

- **3.1 域名白名单**：Options UI 当前**没有**该字段 → ❌ 未通过
- **3.2 二次确认 UI**：Side Panel 当前**没有**该组件 → ❌ 未通过
- **3.3 操作审计日志**：当前**完全未实现** → ❌ 未通过
- **3.4 debugger 权限 UX 告知**：Options UI 当前**没有**该勾选 → ❌ 未通过
- **3.5 一键停用**：Side Panel 当前**没有**该按钮 → ❌ 未通过

**结论（事实）**：5 项清单**全部未通过**。按本节规则，`get_event_listeners`（CDP 版）**不得**实现。

### 5. 备选实现（启发式版 `get_event_listeners`）

满足本节清单 0 项即可启用——**不**走 debugger 路径，仅用 Content Script 重写 + 启发式追踪：

- **可拿到的**：
  - Content Script 安装后用户操作触发的事件（click / submit / keydown 等）→ 已通过 `captureLastTrigger` 跟踪
  - 元素 `on*` 属性（`<button onclick="...">`）→ `el.getAttribute("onclick")` 读
  - 元素 `el._listeners`（框架注入的私有字段，**不可靠**）
- **拿不到的**：
  - 页面加载时已通过 `addEventListener` 绑定的事件（我们重写时已晚）
  - React 合成事件 / Vue 自定义 `$listeners`（需框架 devtools 协议）
- **Tool 描述必须明写**："heuristic 模式：只能识别 Content Script 安装后捕获的事件 + `on*` 属性，**不**保证完整"

### 6. 写操作 Tool 后续准入

按频次降序，下一项（`click_element` / `type_text`）实现前**必须**：

1. 先按 §3 清单完成 5 项 Side Panel + Options UI 改造
2. §3 全过后 commit 一次"基础设施 PR"
3. 然后**单独 PR** 加写操作 Tool，PR 描述里引用 §3 改造的 commit
4. 评审标准：白名单 + 二次确认 + 审计日志**必须**在 PR diff 里能跑通

### 出处

- §1 debugger 权限 UX：[已确认] Chrome MV3 `chrome.debugger` 文档 + 用户可感知提示
- §2 类别划分：本文基于 `docs/qa/in-browser-agent-tool-roadmap.md` §2 风险等级 + `in-browser-agent-extension-plan.md` §3.7 Tool 设计原则
- §3 5 项清单：[合理判断] 工程经验层；具体阈值（30 秒超时 / 1000 条审计）需在评审 PR 中按实际调整

### 变更日志

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| 2026-08-22 | 创建 agent-safety.md 原始章节 | harness-init |
| 2026-08-22 | 追加 §Debuggger 权限评审与写操作 Tool 准入：5 项清单 + 启发式备选 + `get_event_listeners` 准入判断（**5 项全未通过**） | harness-coding |