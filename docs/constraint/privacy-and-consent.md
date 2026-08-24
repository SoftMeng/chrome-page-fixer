# 隐私实践与用户控制

## 采集范围（最小化）

| 字段 | 默认是否采集 | 备注 |
| --- | --- | --- |
| 错误类型 / 级别 / 时间戳 | 是 | 必需 |
| 错误消息 | 是 | 必需 |
| 错误堆栈 | 是 | 必需 |
| 当前 URL（不含 query 中的敏感字段） | 是 | 必需 |
| 页面标题 | 是 | 必需 |
| 选中元素/DOM 摘要 | 否 | 用户在 UI 显式开启时采集 |
| 请求头/请求体 | 否 | MVP 不采集 |
| `localStorage` / `sessionStorage` 内容 | 否 | 仅在 Tool 显式调用时获取 |
| 截图 | 否 | Tool 调用 `take_screenshot` 时获取，且默认不离开本机 |

## 脱敏规则

- 上传云端前对 URL query 中的 `token`、`session`、`apiKey`、JWT 等字段做替换。
- 对错误消息中的凭据模式（邮箱、API Key、银行卡号）做正则替换。
- 截图默认不上传；若 Tool 调用方需要上传，必须在 UI 明示并提供关闭按钮。

## 用户控制开关

| 开关 | 默认 | 行为 |
| --- | --- | --- |
| 云端上传（错误/页面/截图） | 关 | 仅本地存储 |
| 自动收集最近 N 条错误 | 开 | 用户可关闭 |
| 上传时附带页面 URL | 开 | 用户可关闭 |
| 上传时附带堆栈 | 开 | 用户可关闭 |

## 隐私实践披露草案（可填写）

> 用途：XX
> 采集字段：XX
> 上传字段：XX
> 本地保留期：XX
> 用户权利：查看/删除/导出
> 第三方处理者：XX

每次上架前必须填写并由产品/安全角色复核。

## 出处

- 最小采集与脱敏原则：`docs/qa/chrome-error-capture-mcp-bridge.md` §6。
- 隐私与数据流边界：`docs/qa/in-browser-agent-extension-plan.md` §5。

---

## 各 Tool 的读取与脱敏细则（Post-MVP 阶段 3 补）

### 4.1 `get_storage_snapshot`（本批加）

- **来源**：当前活动 tab 的 `localStorage` / `sessionStorage`（**不**读扩展自身 storage；**不**读 cookie）
- **风险等级**：**高**（token / session / 用户隐私）
- **默认脱敏**：所有 value 返回 `***`；仅键名原样
- **白名单开启**：用户在 Tool 输入的 `properties: ["key1","key2"]` 数组**逐键**点名要明文 → 该键值原样返回；未点名仍脱敏
- **不实现 Cookie**：`chrome.cookies` API 需要 `cookies` 权限 + 跨域披露；**本批不做**
- **Options UI 文案**：新增一行 "读取 localStorage / sessionStorage 需启用访问站点数据（默认已启用 host_permissions）"
- **Tool 描述**：必须写明 "默认返回 `***`；要明文请用 properties 数组逐键点名"

### 4.2 其它 Tool（已交付，细则补充）

- `get_console_messages`：value / stack 截前 200 字符；**不**做内容脱敏（`console` 是开发者主动输出）
- `get_network_log` / `get_resource_timing`：URL query 截前 200 字符；body **不**获取（webRequest MV3 限制）
- `inspect_element` / `list_elements`：attribute 白名单（`ATTRIBUTE_WHITELIST`）+ text 截 20 字符；**不**返回 `value` / `textContent` / `innerHTML`
- `get_errors` / `get_error_by_index`：返回扩展自有错误条目；**不**做内容脱敏，由用户审查 envelope 后上传

### 4.3 unhandledrejection 错误捕获（axios/fetch reject）

当 Promise reject 携带 axios/fetch response（典型：`{ response: { config, status, data } }`）时，扩展抓取并存储以下字段：

| 字段 | 来源 | 处理 |
| --- | --- | --- |
| `endpointUrl` | `response.config.url` 或 `response.url` | 原样 |
| `httpMethod` | `response.config.method` | 大写 |
| `httpStatus` | `response.status` | 数字 |
| `requestBody` | `response.config.data` | **键级脱敏**（见 `entrypoints/shared/redact.ts`） |
| `responseData` | `response.data` | 截前 500 字符 |

**requestBody 键白名单**（值替为 `***`）：
`token` / `access_token` / `refresh_token` / `id_token` / `authorization` / `cookie` / `set-cookie` / `password` / `pwd` / `passwd` / `secret` / `apikey` / `api_key`

大小写不敏感；递归处理嵌套对象（不递归数组元素中的 object）。

**不抓取**：`reason.config.headers`（通常含 `Authorization` 全字段），`reason.request`（node 端对象，浏览器无意义），`response.headers`（Set-Cookie 等敏感头）。

未携带 axios/fetch response 结构的 reject（如 `throw new Error("xxx")`）——退回原行为：仅 message + stack。

### 4.4 待实现（**本批不做**）

| Tool | 阻塞 |
| --- | --- |
| `get_cookies` | 需 `manifest.json` 加 `cookies` 权限 + 完整披露文案；进入下一阶段前补方案 |
| `execute_js` / `click_element` / `type_text` | CLAUDE.md §关键决策 2 写操作 Tool 需 `agent-safety.md` 评审（域名白名单 + 二次确认 + 操作审计） |
| `take_screenshot` | 需 `activeTab` 权限 + 隐私披露；UI 显示"是否离开本机"开关 |