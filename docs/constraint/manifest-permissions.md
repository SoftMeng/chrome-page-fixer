# Manifest V3 权限策略

## MVP 必选权限

| 权限 | 用途 | 商店审核影响 |
| --- | --- | --- |
| `sidePanel` | 承载 Side Panel UI（聊天、工具、错误列表） | 低 |
| `storage` | 持久化错误历史、Agent 会话、用户配置 | 低 |
| `scripting` | 注入主世界脚本以捕获错误、调用 Tool | 中 |
| `activeTab` | 用户主动触发时获得当前标签临时权限，避免 `<all_urls>` | 低 |

## 按需申请

| 权限 | 何时申请 | 商店审核影响 |
| --- | --- | --- |
| `host_permissions`（限定域） | Tool 必须操作特定域时，按域声明 | 中，限制为具体域可显著降低风险 |
| `tabs` | 需要查询多个标签或在新标签打开页面时 | 中 |
| `alarms` | 需要低频跨时间调度（如历史清理） | 低 |
| `offscreen` | 需要在 Offscreen Document 中运行长任务 | 低 |
| `webRequest`（仅监听） | 必须捕获原生资源加载失败（图片 502 / 404、脚本 4xx）且 fetch 拦截无法覆盖时 | 中，仅 `onResponseStarted` 监听，无需阻塞模式 |
| `host_permissions: ["<all_urls>"]` | 仅当 `webRequest` 监听器需要覆盖任意 URL 时。注意：Chrome MV3 中 `webRequest` + `urls: ["<all_urls>"]` 必须配 `host_permissions: ["<all_urls>"]`，否则监听器会被静默丢弃。 | 高，扩展可观察所有 URL 的网络请求；触发商店审核级别 |

## MVP 禁止申请

| 权限/配置 | 禁止原因 | 出处 |
| --- | --- | --- |
| `debugger` | 触发安装警告、商店审核严格；除非扩展核心价值建立在 CDP 上 | `docs/qa/claude-in-chrome-alternatives.md` §3.3（`chrome.debugger` 警告已确认） |
| `webRequest`（阻塞模式） | 商店审核严格，性能与隐私影响大 | `docs/qa/extension-pitfalls-and-best-practices.md` §3.4 |
| `host_permissions: ["<all_urls>"]` | 过度授权，应替换为 `activeTab` + 限定域 | `docs/qa/extension-pitfalls-and-best-practices.md` §3.4 |
| 远端加载代码（含 WASM bundle） | Manifest V3 政策禁止；WASM 必须打包进扩展包 | `docs/qa/in-browser-agent-extension-plan.md` §3.2 |

## 权限新增流程

1. 在 `harness-decide` 中评估必要性，给出可替代方案。
2. 在对应 QA 段落追加变更与影响。
3. 在本文件“按需申请”或“MVP 禁止申请”表中维护。
4. 在 `docs/qa/README.md` 变更日志追加条目。

## 验收

- 上架前通过 `harness-security` 复审：每个权限都有对应的运行时必要性说明。
- 没有权限被“为了未来可能”而提前声明。