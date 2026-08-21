# docs/qa/ 索引

## 文档清单

| 文件 | 主题 | 目标读者 | 推荐阅读阶段 |
| --- | --- | --- | --- |
| `chrome-error-capture-mcp-bridge.md` | 是否自研扩展、Chrome DevTools MCP 与本地 MCP 桥接方案评估 | 产品/架构决策者 | 路线评估期 |
| `claude-in-chrome-alternatives.md` | 官方 Claude in Chrome 扩展体验评估与替代方案 | 产品/架构决策者 | 路线评估期 |
| `in-browser-agent-extension-plan.md` | 内置 Agent + 大量 Tool + 页面操作的核验与 MVP 边界 | 架构决策者、实现者 | MVP 设计期 |
| `extension-pitfalls-and-best-practices.md` | Manifest V3 / 权限 / 主世界注入 / Service Worker 生命周期等陷阱与最佳实践 | 实现者、QA | 开发期、代码评审期 |

## 推荐阅读顺序

1. 路线评估期：`chrome-error-capture-mcp-bridge.md` → `claude-in-chrome-alternatives.md`
2. MVP 设计期：新增 `in-browser-agent-extension-plan.md`
3. 开发与评审期：补充 `extension-pitfalls-and-best-practices.md`

## 共同证据等级

四份文档统一使用以下四级标注：

| 等级 | 含义 |
| --- | --- |
| 已确认 | Chrome / Anthropic / Google 官方文档或权威安全公告可直接支持 |
| 合理判断 | 工程经验层面的判断，仍需在目标项目验证 |
| 待验证 | 提出但未找到权威来源，不能据此做技术承诺 |
| 不应直接采纳 | 表述过度绝对、范围不清或可能误导 |

## 引用约定

- 任何对 Chrome DevTools MCP 能力的引用，权威段落见 `chrome-error-capture-mcp-bridge.md` §3.2。
- 任何对 Claude in Chrome 安全风险的引用，权威段落见 `claude-in-chrome-alternatives.md` §3.3。
- 任何对 Tool 设计原则的引用，权威段落见 `in-browser-agent-extension-plan.md` §3.7、§4。
- 任何对 Manifest V3 / 主世界注入 / Service Worker 的引用，权威段落见 `extension-pitfalls-and-best-practices.md` §3。

## 变更日志

| 日期 | 变更 | 来源 |
| --- | --- | --- |
| 2026-08-19 | 创建 `README.md` 索引 | `harness-init` |
| 2026-08-19 | 收敛 `claude-in-chrome-alternatives.md` §3.4 中对 Chrome DevTools MCP 的重复叙述，改为指向 `chrome-error-capture-mcp-bridge.md` §3.2 | `harness-init` |
| 2026-08-21 | 启用 `webRequest` 监听（仅 `onResponseStarted`，不阻塞），捕获 `<img>` / `<script>` / `<link>` 原生资源加载的 4xx/5xx；同步 `manifest-permissions.md` 调整约束，MVP 实施新增 `webRequest` 权限 | `harness-coding` |
| 2026-08-21 | 修复 `chrome.webRequest` 监听静默丢弃的根因：为 `webRequest` 配 `host_permissions: ["<all_urls>"]`（MV3 必需），同步更新 `manifest-permissions.md` 标注此组合的隐私代价 | `harness-coding` |

## 待办与缺口（来自四份 QA 的“待补充资料”）

- 目标站点类型、错误量级、登录态/支付页占比（影响 Tool 边界）
- LLM 提供方、API Key 管理、数据驻留策略
- 写操作 Tool 的具体清单、授权模型、审计需求
- 商店发布计划与隐私实践披露草案
- 本地 LLM 推理的设备配置、模型权重来源、版本锁定策略