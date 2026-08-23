# CLAUDE.md

This file provides guidance to Claude Code in this repository.

## 项目概述

- **项目类型**：Chrome 扩展（Manifest V3）
- **目标用户**：前端开发者与前端调试协作者
- **核心能力**：结构化错误捕获 → 一键复制 / Side Panel 列表 → 内置多轮 AI 对话（基于 envelope）
- **MVP 状态**：已交付
  - 错误捕获（console / uncaught / unhandledrejection / resource-load / webRequest 4xx-5xx）
  - Side Panel：3 Tab（错误 / 对话 / 历史）
  - 多轮 AI 对话（chrome.storage.local 持久化、stable #N 引用、askAbout 按 hash 复用会话）
  - System Prompt 独立维护，注入 Anthropic Messages `system` 字段
  - BYOK + Proxy URL（Anthropic 协议）
- **Post-MVP 候选**：网络错误补 DOM 上下文（劫持 content script fetch/XHR）、Anthropic Tool Use、写操作 Tool（域名白名单 + 二次确认）
- **Post-MVP 阶段1 已交付**：
  - DOM 上下文：网络错误带 `triggerSelector` / `triggerElement`（跨域 / 未记录诚实标注）
  - Anthropic Tool Use：3 个只读 Tool（`get_errors` / `get_error_by_index` / `search_errors_by_message`），tool runner 硬上限 5 轮
- **Post-MVP 阶段2 已交付**：
  - 第 4 个 Tool `inspect_element`：CSS selector → tag / id / class / 受限 attribute 白名单 / bounding rect / 可见性 / 前 3 层祖先 selector；**不**返回 `textContent` / `value` / `innerHTML`（隐私）
  - 桥接：background → content script（ISOLATED → MAIN world），`chrome.tabs.sendMessage` 1 秒超时；`:root` / `html` / `body` / `*` 被拒绝
- **Post-MVP 阶段3 已交付（代码）**（Agent 框架）：
  - 迁移到 **Vercel AI SDK**（`ai` v7 + `@ai-sdk/anthropic` v4 + `zod` v4）
  - Tool loop 由 SDK `stopWhen: stepCountIs(5)` 接管
  - Tool 定义改用 `tool({description, inputSchema: z.object({...}), execute})` —— schema强校验
  - 一次性旧路径（ANALYZE）也走 SDK `generateText`
  - 自研 `runAgentWithTools` / `ContentBlock` / `TOOL_REGISTRY` 已删除
  - 代价：bundle background.js 26 kB → **413 kB**（+387 kB）—— 接受为「一次到位」换得 L2 决策层能力
- **Post-MVP 阶段4 已交付**（Tool 扩到 12 个 + prompt 修复）：
  - 新增 8 个只读 Tool：`list_elements` / `get_console_messages` / `get_network_log` / `get_resource_timing` / `get_computed_style` / `get_storage_snapshot` / `get_event_listeners` / `get_page_dom_html` / `get_navigation_timing`（`get_event_listeners` 用启发式，不识别 `addEventListener` / 框架虚拟事件）
  - system-prompt 重写：三角循环心智模型 + 12-Tool 能力地图 + "envelope 和 Tool 是并列数据源，按用户问题走，不先 envelope 后 Tool"
  - **状态**：5 commit 已 push 到 `feature/agent-migration`，待 e2e（`docs/qa/agent-e2e-checklist.md` 23 场景）验证后打 tag `v-ai-sdk-migration` + PR 合 develop

## 关键决策（每条必须追溯到 QA 段落）

1. **不加载远端代码（含 WASM bundle）** — Manifest V3 政策禁止，会导致商店下架。
   出处：`docs/qa/in-browser-agent-extension-plan.md` §3.2。
2. **写操作 Tool 不默认开放** — 必须域名白名单 + 二次确认 + 操作审计。
   出处：`docs/qa/extension-pitfalls-and-best-practices.md` §3.3，`docs/qa/in-browser-agent-extension-plan.md` §5。
3. **Service Worker 状态必须持久化** — 使用 `chrome.storage` / IndexedDB，禁止仅依赖内存状态。
   出处：`docs/qa/extension-pitfalls-and-best-practices.md` §3.1。
4. **任何事实必须标注证据等级** — 不把第三方建议或社区贴文直接当成官方事实。
   出处：`docs/qa/chrome-error-capture-mcp-bridge.md` §2。
5. **System Prompt 注入走 Anthropic Messages `system` 字段** — 与 `messages` 同级，不混入 user/assistant；内容独立文件 `entrypoints/shared/system-prompt.ts` 维护，每次会话固定。
   出处：Anthropic Messages API 文档（system 字段）。
6. **Agent 框架选 Vercel AI SDK** — 跨 Provider 抽象、Tool Use 原生、zod 强校验；接受 bundle +374 kB 作为 L2 决策层能力的代价。
   出处：`entrypoints/agent/provider.ts` / `entrypoints/agent/run.ts` / `entrypoints/agent/tools.ts`。

## 技术栈

- Manifest V3 + WXT（脚手架）
- TypeScript strict + `noUncheckedIndexedAccess`（Content Script、Background、Side Panel、Options）
- React 18（Side Panel / Options UI）
- **Vercel AI SDK**（`ai` v7 + `@ai-sdk/anthropic` v4 + `zod` v4）—— Agent loop 与 Tool Use
- Anthropic Messages API（BYOK + Proxy URL；`x-api-key` + `anthropic-dangerous-direct-browser-access`）
- Side Panel 作为主 UI 入口
- chrome.storage.local 持久化（错误缓冲、会话、引用编号、设置）

## 项目结构（当前）

```
.
├── CLAUDE.md                       # 本文件
├── docs/
│   ├── qa/                         # 外部资料核验与决策记录
│   │   ├── README.md
│   │   ├── chrome-error-capture-mcp-bridge.md
│   │   ├── claude-in-chrome-alternatives.md
│   │   ├── in-browser-agent-extension-plan.md
│   │   └── extension-pitfalls-and-best-practices.md
│   └── constraint/                 # 工程约束（可被 lint / 评审引用）
│       ├── README.md
│       ├── manifest-permissions.md
│       ├── tool-design.md
│       ├── agent-safety.md
│       └── privacy-and-consent.md
└── entrypoints/
    ├── background.ts               # SW：监听 + 通过 Vercel AI SDK 调用 Anthropic
    ├── capture-main.content.ts     # 主世界脚本（console / error / unhandledrejection / fetch 劫持 / DOM inspect）
    ├── capture.content.ts          # 隔离世界脚本（postMessage → PAGE_ERROR / INSPECT_ELEMENT）
    ├── options/App.tsx             # BYOK / Proxy / App Hint 设置
    ├── agent/                      # Vercel AI SDK 接入层（Post-MVP 阶段3）
    │   ├── provider.ts             # createAnthropic({baseURL, apiKey, headers})
    │   ├── run.ts                  # runAgentWithTools 包装 generateText + stopWhen
    │   └── tools.ts                # 4 个 tool({parameters, execute}) 定义
    ├── shared/                     # 跨 entrypoint 复用模块
    │   ├── types.ts                # ErrorEntry / ChatSession 等
    │   ├── messaging.ts            # PAGE_ERROR / ANALYZE / ANALYZE_TURN / INSPECT_ELEMENT_*
    │   ├── storage.ts              # settings（apiKey / proxyUrl / appHint）
    │   ├── storage-constants.ts
    │   ├── chat-storage.ts         # 会话持久化
    │   ├── chat-prompt.ts          # 多轮 messages 构建
    │   ├── system-prompt.ts        # 独立维护的 System Prompt
    │   ├── error-index.ts          # stable hash→#N 映射
    │   ├── format.ts               # envelope / Markdown 输出
    │   └── tools/                  # Tool 纯函数实现（与 schema 解耦）
    │       ├── get-errors.ts
    │       ├── get-error-by-index.ts
    │       ├── search-errors.ts
    │       └── inspect-element.ts
    └── sidepanel/
        ├── App.tsx                 # 3 Tab 容器
        ├── ChatPanel.tsx           # 对话面板
        ├── HistoryView.tsx         # 历史会话列表
        ├── CopyButton.tsx          # 复制按钮
        ├── markdown.tsx            # 零依赖 Markdown 渲染（XSS-safe）
        ├── useAppState.ts          # 状态聚合 hook
        ├── useChatUiState.ts       # busy / chatError hook
        ├── main.tsx
        ├── styles.css              # 错误列表 / 历史样式
        └── chat-panel.css          # 对话面板样式
```

## 约束引用

- 详细权限与权限申请规则：`docs/constraint/manifest-permissions.md`
- Tool 设计原则：`docs/constraint/tool-design.md`
- Agent 安全与操作审计：`docs/constraint/agent-safety.md`
- 数据采集与隐私实践：`docs/constraint/privacy-and-consent.md`
- QA 文档总索引与阅读顺序：`docs/qa/README.md`

## Skill 映射

| 任务 | 首选 Skill |
| --- | --- |
| 计划与意图澄清 | `harness-plan` / `harness-clarify` |
| 文档结构设计 | `harness-doc-design` |
| 决策取舍 | `harness-decide` |
| 开发实现（TS/React） | `harness-typescript-development` / `harness-react-dev` |
| 安全与权限审查 | `harness-security` |
| 调试 | `harness-debug` |
| 质量与测试 | `harness-testing` / `harness-quality-verification` |
| 体系演进 | `harness-evolution` |
| 项目初始化与 CLAUDE 维护 | `harness-init` |
| System Prompt 设计 | `harness-prompt-engineer` / `harness-human-prompt` |

## 开发流程

1. 任何外部资料先经证据等级评估再写入决策记录。
2. 任何新能力先在 QA 中评估，再进入 Post-MVP。
3. 任何权限新增必须先通过 `docs/constraint/manifest-permissions.md` 评审。
4. 任何 Tool 新增必须先在 `docs/constraint/tool-design.md` 中登记 schema。
5. 任何 Agent 操作变更必须先经过 `docs/constraint/agent-safety.md` 评审。
6. 任何上传云端的字段必须先在 `docs/constraint/privacy-and-consent.md` 中登记。

## 工程铁律

- 单一职责：避免职责不清晰、越界、混合、命名混乱、引用混乱、归属不清晰、边界抽象、逻辑重复、异常静默处理；以正确性、可读性、可维护性、性能、安全为目标，不打补丁、不敷衍、不臆测、不留尾巴。
- 整洁之道：文档与代码篇幅追求精炼有效；不敷衍也不过度设计，简洁高效。
- 选型纪律：任何"换框架 / 换 Provider"决策前必须先验事实（npm 包大小、官方文档、bundle 实际数据），不接受第三方"推荐"作为结论。

## 最近决策时间线

| 阶段 | commit / tag | 决策 | 关键事实 |
| --- | --- | --- | --- |
| MVP 阶段 1–4 | `926e814` | scaffold + capture + BYOK + AI envelope | — |
| MVP 收尾 | `043e8bc` | 多轮 AI 对话 + envelope 引用 | — |
| Post-MVP 阶段1 | `5a7506a` | 网络错误补 DOM 上下文（fetch / XHR 劫持 + `triggerSelector`） | — |
| Post-MVP 阶段2 | `5185555` / `v-pre-ai-sdk` | Anthropic Tool Use + 4 个只读 Tool（`get_errors` / `get_error_by_index` / `search_errors_by_message` / `inspect_element`） | 自研 `runAgentWithTools` 30 行 loop；Tool runner 5 轮上限 |
| Post-MVP 阶段3 | `9751d73` / `v-ai-sdk-migration`（待打 tag） | **迁移到 Vercel AI SDK** + Tool 扩到 12 个 + system-prompt 重写 | bundle background.js 26 → **413 kB**（+387 kB）；自研 loop 删除；Tool 改用 `tool({inputSchema, execute})`；`stopWhen: stepCountIs(5)`；12 Tool 中 11 个新增于阶段4，1 个（`inspect_element`）阶段2 已就位 |

**当前状态**：
- 分支：`feature/agent-migration`，已 push 5 个 commit 到远端
- 远端链：`9751d73` → `c661352` → `8665385` → `df3db63` → `2b9803c` → `5185555`（`v-pre-ai-sdk`）
- 待办：跑 `docs/qa/agent-e2e-checklist.md` 23 场景（spiritai tab + basicZone）→ 通过后打 tag `v-ai-sdk-migration` → 开 PR 合到 `develop`
- 回滚点：`git reset --hard v-pre-ai-sdk` 可回到 `5185555`

## 重要注意事项

- 不引用未经核验的具体评分、漏洞编号或维护者数据。
- 不把社区贴文、第三方教程、模型生成内容当作官方事实。
- 外部依赖版本变化（Chrome DevTools MCP / Rig / Anthropic 文档 / Vercel AI SDK）需要在 `docs/qa/README.md` 变更日志中更新。