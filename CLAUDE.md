# CLAUDE.md

This file provides guidance to Claude Code in this repository.

## 项目概述

- **项目类型**：Chrome 扩展（Manifest V3）
- **目标用户**：前端开发者与前端调试协作者
- **核心能力**：结构化错误捕获与一键复制、内置 Agent 分析当前页面、可选页面操作
- **MVP 范围**：错误捕获 → 一键复制 → Side Panel 列表 → 云端 Agent + 5–8 个只读 Tool
- **暂不在 MVP**：写操作 Tool、Rig WASM Agent、本地 LLM、`chrome.debugger`、自动修复

## 关键决策（每条必须追溯到 QA 段落）

1. **不加载远端代码（含 WASM bundle）** — Manifest V3 政策禁止，会导致商店下架。
   出处：`docs/qa/in-browser-agent-extension-plan.md` §3.2。
2. **写操作 Tool 不默认开放** — 必须域名白名单 + 二次确认 + 操作审计。
   出处：`docs/qa/extension-pitfalls-and-best-practices.md` §3.3，`docs/qa/in-browser-agent-extension-plan.md` §5。
3. **Service Worker 状态必须持久化** — 使用 `chrome.storage` / IndexedDB，禁止仅依赖内存状态。
   出处：`docs/qa/extension-pitfalls-and-best-practices.md` §3.1。
4. **任何事实必须标注证据等级** — 不把第三方建议或社区贴文直接当成官方事实。
   出处：`docs/qa/chrome-error-capture-mcp-bridge.md` §2。

## 技术栈

- Manifest V3 + Plasmo 或 WXT（脚手架）
- TypeScript（Content Script、Background、Side Panel）
- React（Side Panel UI）
- 官方 MCP SDK（TypeScript 端，不在 WASM）
- Side Panel 作为主 UI 入口

## 项目结构（初始态）

```
.
├── CLAUDE.md                       # 本文件
├── docs/
│   ├── qa/                        # 外部资料核验与决策记录
│   │   ├── README.md              # QA 索引、阅读顺序、变更日志
│   │   ├── chrome-error-capture-mcp-bridge.md
│   │   ├── claude-in-chrome-alternatives.md
│   │   ├── in-browser-agent-extension-plan.md
│   │   └── extension-pitfalls-and-best-practices.md
│   └── constraint/                # 工程约束（可被 lint / 评审引用）
│       ├── README.md
│       ├── manifest-permissions.md
│       ├── tool-design.md
│       ├── agent-safety.md
│       └── privacy-and-consent.md
└── (后续按扩展脚手架生成 src/、public/ 等)
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

## 开发流程

1. 任何外部资料先经证据等级评估再写入决策记录。
2. 任何新能力先在 QA 中评估，再进入 MVP。
3. 任何权限新增必须先通过 `docs/constraint/manifest-permissions.md` 评审。
4. 任何 Tool 新增必须先在 `docs/constraint/tool-design.md` 中登记 schema。
6. 任何 Agent 操作变更必须先经过 `docs/constraint/agent-safety.md` 评审。
5. 任何上传云端的字段必须先在 `docs/constraint/privacy-and-consent.md` 中登记。

## 重要注意事项

- 不引用未经核验的具体评分、漏洞编号或维护者数据。
- 不把社区贴文、第三方教程、模型生成内容当作官方事实。
- 外部依赖版本变化（Chrome DevTools MCP / Rig / Anthropic 文档）需要在 `docs/qa/README.md` 变更日志中更新。