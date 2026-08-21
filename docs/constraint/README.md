# docs/constraint/ 约束目录索引

## 生效范围

- **开发期**：提交前由 `harness-code-review` / `harness-quality-verification` 引用。
- **上架期**：提交 Chrome Web Store 前由产品/安全角色引用。
- **运行期**：扩展运行时出现权限、Tool、安全相关变更前由架构角色引用。

## 约束文件

| 文件 | 内容 | 主要出处 |
| --- | --- | --- |
| `manifest-permissions.md` | Manifest V3 权限申请策略 | `docs/qa/in-browser-agent-extension-plan.md` §3.3、`docs/qa/extension-pitfalls-and-best-practices.md` §3.4 |
| `tool-design.md` | Tool 分类、schema、危险等级、数量控制 | `docs/qa/in-browser-agent-extension-plan.md` §3.7、§4 |
| `agent-safety.md` | Agent 操作授权、prompt injection 缓解、跨域与登录态保护 | `docs/qa/in-browser-agent-extension-plan.md` §5、`docs/qa/extension-pitfalls-and-best-practices.md` §3.3、§3.4 |
| `privacy-and-consent.md` | 采集范围、脱敏、用户控制开关、隐私披露模板 | `docs/qa/chrome-error-capture-mcp-bridge.md` §6、`docs/qa/in-browser-agent-extension-plan.md` §5 |

## 与 QA 的关系

- 约束文件不是 QA 的复制：QA 记录“为什么会这样判断”，约束文件记录“我们现在必须遵守的规则”。
- 任何约束条款都必须有 QA 出处；新增/修改约束需先在 QA 中记录或评审，再写入约束文件。

## 修订流程

1. 通过 `harness-decide` 评审变更必要性与影响范围。
2. 在对应 QA 文档追加变更说明。
3. 在本目录更新对应约束文件。
4. 在 `docs/qa/README.md` 变更日志追加条目。