# 内置 Agent + Tool + 页面操作扩展方案 QA

- **文档状态**：外部资料核验记录
- **资料来源**：用户提供的 Grok 方案建议
- **核验日期**：2026-08-19
- **不重复声明**：本文聚焦“内置 Agent + 大量 Tool + 页面操作”这一路线，通用 MCP 桥接设计原则见 `docs/qa/chrome-error-capture-mcp-bridge.md`，Claude in Chrome 体验评估见 `docs/qa/claude-in-chrome-alternatives.md`。

## 1. 结论

Grok 给出的方向——“内置 Agent + 大量 Tool + 页面操作”——是合理且可落地的产品方向，但其中三条关键工程假设在 Manifest V3 政策下不能照单全收：

- 远端代码（含 WASM bundle）被 MV3 政策禁止，必须把 Agent 能力打包进扩展包，不能按“在线拉取 WASM”的方式部署；
- `chrome.debugger` 会触发 Chrome 安装警告和商店审核关注，扩展若不是以 DevTools 调试为核心，应避免使用；
- Rig 框架虽然支持 `wasm32-unknown-unknown`，但其 MCP 集成 (`rmcp`) 是 native-only，不能在 Service Worker/Offscreen Document 里直接接入；如需 MCP 协议，要么退化为 TS/JS 端，要么用本地 Node 子进程桥接。

产品方向本身（Agent + Tool + 页面操作）是有价值的，但 MVP 应当收窄为：

- 错误结构化捕获 + 一键复制（最快闭环，最高频痛点）；
- 调用云端 API 的极简 Agent；
- 5–8 个工具，覆盖错误查询、页面感知、只读类辅助操作；
- 任何写操作（点击、输入、提交、表单填写）默认关闭，依赖用户显式触发或域名白名单。

WASM/Rig、本地 LLM、chrome.debugger 这三类能力延后验证，避免在第一版陷入权限审核、编译链、模型体积三类不相关复杂度。

## 2. 证据等级说明

| 等级 | 含义 |
| --- | --- |
| 已确认 | Chrome/Google 官方文档或权威安全公告支持 |
| 合理判断 | 工程经验层面的判断，仍需在目标项目验证 |
| 待验证 | Grok 资料中提出但本次未找到权威来源，不能据此做技术承诺 |
| 不应直接采纳 | 描述与政策冲突或缺乏依据，可能引发合规/审核风险 |

## 3. 核验结果

### 3.1 “内置 Agent 的插件是值得做的方向”——合理判断

把捕获、Agent 分析、页面操作整合到同一扩展里有清晰价值：减少工具切换、保留页面上下文、能即时验证修复。但该价值是有边界的：

- 价值取决于用户是否真的想“在不离开页面”的前提下分析问题；
- 如果用户主要是把错误丢给 Claude Code 修改本地仓库，那么“本地桥接 + MCP”会更轻；
- 如果用户主要在生产/真实登录页面操作，安全约束会显著降低可用性。

判断顺序应为：先验证用户工作流中最痛的 20% 场景，再决定要不要扩到 80%。

### 3.2 Manifest V3 远端代码策略 — 已确认

- Manifest V3 政策禁止扩展加载远端代码；
- 2024 年 4 月 Google 进一步澄清，该政策同样适用于 WebAssembly bundle；
- 评审中曾出现恶意扩展利用 WASM bundle 作为远端代码投递链被下架的案例。

因此：

- 不能把编译产物上传到 CDN 让扩展动态加载；
- WASM 必须随扩展包一起打包、签名并随版本发布；
- 任何“Agent 框架在线下载/加载”的设想在 Chrome 商店场景下都不可接受；自用/企业内部分发可豁免，但需自担审核风险。

### 3.3 chrome.debugger 的用户提示与审核影响 — 已确认

- `chrome.debugger` API 调用 `chrome.debugger.attach` 前必须在 manifest 中声明权限；
- 安装时 Chrome 会向用户展示警告弹窗，扩展管理页面也会持续提示；
- 该 API 暴露的是 Chrome DevTools Protocol（CDP）的子集，并非通用能力。

建议：

- 只有扩展核心价值建立在 CDP 调试能力上时才声明；
- 否则应优先用 content script + `chrome.scripting.executeScript` 完成 DOM 访问和操作；
- 把 `debugger` 列为可选增强项，并在商店描述中明确说明用途。

### 3.4 Side Panel 是官方支持的扩展 UI — 已确认（部分细节待验证）

- Chrome 提供 `chrome.sidePanel` API 与 `sidePanel` 权限，Side Panel 可承载完整的扩展页面；
- `sidePanel.open()` 通常要求用户手势（例如点击工具栏图标）才能打开。

需要进一步核验：

- `sidePanel.setPanelBehavior()` 是否允许自动打开、跨标签页保持等行为；
- Side Panel 页面与 content script / background 之间的消息模型；
- Side Panel 中 WebGPU/大内存页面是否会受到 Service Worker 生命周期影响。

### 3.5 Rig 在浏览器扩展中的可用性 — 部分已确认

- Rig README 明确支持 `wasm32-unknown-unknown`，可编译到浏览器/Service Worker；
- 但 `rmcp`（Rust 实现的 MCP 客户端/服务端）是 native-only，不在 wasm 范围内；
- Rig 自身处于快速演进阶段，未来更新可能引入破坏性变更。

因此：

- “Agent 核心跑在 WASM 里”在 Rust 层是可行的；
- “Agent 直接通过 `rmcp` 与本地 MCP Server 通信”在 WASM 路径下不可行；
- 实践路径有两种：(a) 在 TS/JS 侧使用官方 MCP SDK；(b) 用本地 Node 子进程承载 MCP 协议，由 WASM Agent 与子进程通信；
- Rig 版本锁必须严格记录，升级前必须重测 Tool 调用。

### 3.6 “WebGPU + 本地 1B–3B 模型”—— 待验证，不要作为 MVP 承诺

未在权威文档中找到“Chrome 扩展 Service Worker / Offscreen Document 可加载并运行 1B–3B 参数 LLM”的直接证据。可信的实现路径通常是：

- 在扩展页面（Side Panel）中通过 WebGPU 推理；
- 模型权重必须随扩展一起打包或由用户在本地选择路径；
- 受限于扩展包体积（目前 Manifest V3 政策对资源规模有约束）、首次冷加载时间和用户机器配置。

建议：把“本地 LLM”作为可选高级能力，不进入 MVP；只在云端方案的成本/隐私出现明显瓶颈时再评估。

### 3.7 “Tool 列表（错误/感知/操作/调试/分析）”—— 合理判断，但需要约束

Grok 给出的 Tool 分类合理，但 Tool 设计需要满足：

- 每个 Tool 必须有明确输入/输出/错误模型；
- 写操作 Tool 必须标记为“破坏性”，默认禁用，要求用户启用；
- 涉及隐私的 Tool（如 `get_local_storage`、`take_screenshot`、`execute_js`）必须有单独授权；
- Tool 数量应受控，不要一次性发布 30 个 Tool 而没有文档和测试。

### 3.8 “MVP 1–2 周”—— 待验证

不应当作项目估算依据。1–2 周的成立条件：

- 团队已有 Manifest V3 扩展和 Side Panel 经验；
- 已选定云端 LLM 客户端并具备密钥管理方案；
- 不包含 chrome.debugger、Rig WASM、本地模型；
- Tool 数量控制在 5–8 个；
- 商店审核/发布不在 1–2 周内。

任何超出上述边界的扩展都会显著拉长工期。

## 4. MVP 范围（建议）

| 模块 | 范围 | 不在 MVP |
| --- | --- | --- |
| 错误捕获 | console.error / warn、`unhandledrejection`、`window.onerror`；结构化为 Markdown | 网络失败、source map 自动还原 |
| 一键复制 | 单错误复制、最近 N 条合并复制 | 模板化 Prompt 生成 |
| Side Panel UI | 错误列表 + 简单聊天窗 | 自定义主题、动效、协作 |
| Agent | 云端 API 调用 + 5–8 个 Tool | 本地推理、Rig WASM |
| Tool（只读） | get_console_errors、get_page_info、get_dom_snapshot、query_selector、get_computed_style、search_in_page、take_screenshot | click/type/scroll 等写操作 |
| 写操作 | 默认关闭，按域名白名单启用 | 默认放开任何操作 |
| 权限 | `sidePanel`、`storage`、`scripting`、`activeTab`、按需 `host_permissions` | `debugger`、`webRequest` 阻塞 |

写操作进入增强版之前，必须先回答：谁授权、谁能撤销、如何审计、如何在跨页面 iframe 中安全执行。

## 5. 风险与边界

### 权限与商店审核

- `scripting`、`activeTab`、`host_permissions` 已是大多数扩展的常规权限，需在隐私实践中明示用途；
- `debugger`、`webRequest` 阻塞等高权限会显著拉长审核周期并提升被拒风险；
- 远端加载任何代码（包括 WASM bundle）会导致直接下架。

### Agent 操作页面的安全风险

- Agent 被 prompt injection 后可能执行危险操作（删除数据、提交表单、跳转页面）；
- 必须有：每次或按会话的显式确认、按域名白名单的操作范围、可审计的操作日志；
- 应避免让 Agent 直接接触跨源 iframe、登录态表单和支付页；
- 任何“自动重试直到成功”的逻辑都应被禁止。

### 性能与生命周期

- Service Worker 是事件驱动、可能被回收，长任务或长连接必须放在 Offscreen Document 或 Side Panel；
- 大体积 WASM 会拉长扩展启动时间和 Side Panel 首屏；
- Tool 调用频次过高会拖慢 UI，应采用节流、缓存与按需加载策略。

### 数据隐私

- 错误消息、URL、DOM 摘要、请求参数、localStorage 中可能含有令牌或用户数据；
- 默认应采集最小必要信息，并对敏感字段脱敏；
- 任何上传云端 API 的内容都应在 UI 上明示并可关闭。

### 诊断正确性

- 浏览器侧错误只能反映运行时表象，不能替代仓库代码、复现步骤和测试；
- Agent 给出的“修复建议”必须经过本地构建/测试/审阅，不可作为最终结论。

## 6. 决策规则

| 场景 | 建议 |
| --- | --- |
| 主要需求是“捕获并把错误交给 Claude Code 改仓库代码” | 走 `chrome-error-capture-mcp-bridge.md` 的 MCP 路线，自研成本最低 |
| 主要需求是“在页面里即时分析并执行只读/写操作” | 自研扩展 + 云端 Agent MVP |
| 需要稳定操作已登录页面 | 评估官方 Claude in Chrome 扩展，并落地 Anthropic 的 prompt injection 缓解措施 |
| 需要本地推理或离线使用 | 仅在用户量与隐私需求证实后再评估 Rig WASM + WebGPU |
| 准备发布到 Chrome Web Store | 提前规划隐私实践、权限清单、用途说明，避免后期返工 |

## 7. 待补充资料

- 项目的目标用户场景、典型工作流与每日错误量；
- 计划的 LLM 提供方、密钥管理方案与数据驻留策略；
- 是否需要支持跨域 iframe、登录态表单、支付流程；
- 写操作 Tool 的具体清单、授权模型与审计需求；
- 商店发布计划与隐私实践披露草案；
- 若评估本地推理，需确定目标设备配置、WebGPU 可用性与模型权重来源。

## 8. 参考资料

- [Manifest V3 migration: issues, solutions, and timelines](https://developer.chrome.com/docs/extensions/develop/migrate/to-manifest-v3)
- [chrome.debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Chrome for Developers：扩展文档总览](https://developer.chrome.com/docs/extensions)
- [Rig (Rust LLM framework) GitHub](https://github.com/0xPlaygrounds/rig)
- [Anthropic：Claude in Chrome prompt injection 防御加固](https://www.anthropic.com/news/claude-chrome-prompt-injection-defense)
- [Anthropic：Claude in Chrome 使用与安全说明](https://support.anthropic.com/en/articles/12111668-claude-in-chrome-extensions)

## 9. 记录说明

本文将 Grok 资料中的“远端加载/在线拉取 WASM”“MVP 1–2 周”“本地 1B–3B 模型”“30 个 Tool”等建议降级为待验证或合理判断，并基于 MV3 政策、Rig 实际能力、Chrome 权限模型给出了边界。后续若团队完成 MVP 验证，应在本文追加“实测记录”小节，写明：使用的工具版本、声明的权限、商店审核结果、Tool 实际命中率与误操作率。