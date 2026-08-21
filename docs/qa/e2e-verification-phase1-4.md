# 端到端验收清单（Phase 1–4）

## 0. 环境准备（约 5 分钟）

- [ ] 进入项目根：`cd /Users/xiangyuanmeng/Documents/Qoder/chrome-page-fixer`
- [ ] 首次运行安装依赖：`pnpm install`（项目未生成锁文件时也可使用 `npm install`）
- [ ] 启动 WXT 开发模式：`pnpm dev`（macOS 上若 pnpm 不可用：`npm install -g pnpm`）
- [ ] 等待 WXT 在终端打印：`.output/chrome-mv3/manifest.json` 已生成
- [ ] 在 Chrome 打开 `chrome://extensions`，打开右上角「开发者模式」
- [ ] 点击「加载已解压的扩展程序」，选择 `/Users/xiangyuanmeng/Documents/Qoder/chrome-page-fixer/.output/chrome-mv3`
- [ ] 扩展列表中出现「Chrome Page Fixer」条目，且「Service Worker」开关显示为活跃

**预期**：扩展出现在列表，无红字错误。  
**若失败**：检查 WXT 终端是否有 TypeScript 编译错误；检查 `.output/chrome-mv3/manifest.json` 的 `permissions` 字段是否仅含 `["sidePanel","storage","scripting","activeTab"]`。

## 1. 捕获段：主世界注入 → Side Panel 列表（约 5 分钟）

- [ ] 用 Chrome 新标签打开测试页：`file:///Users/xiangyuanmeng/Documents/Qoder/chrome-page-fixer/tests/error-pages/index.html`
- [ ] 测试页 DevTools Console 应出现：`[fixture] console.error: typed-string-mismatch` 等四条日志（其中 `fetch` 失败属于异步网络层，无控制台输出）
- [ ] 点击工具栏扩展图标，Side Panel 弹出
- [ ] Side Panel 标题为「Chrome Page Fixer」，副标题显示 `3 / 200 条`（注：网络失败的 `fetch` 不会被捕获，所以是3 不是4）
- [ ] 列表里出现三条目，按时间倒序排列：未捕获异常 → Promise rejection → console.error
- [ ] 列表项展示字段：`level`、`HH:MM:SS`、`message`、`url`

**预期**：三条目全部出现，URL 都是测试页 `file:///.../index.html`。  
**若失败**：

- 列表为空 → 主世界脚本未注入：检查 `.output/chrome-mv3/chunks/` 下是否有 `capture-main` 编译产物；检查 `entrypoints/capture-main.world.ts?scripting` 是否在 `.output/chrome-mv3/manifest.json` 的 `content_scripts` 数组（不是 `web_accessible_resources`）
- 只有 console.error 没有异常 → 主世界脚本被注入但 `window.addEventListener("error", ...)` 未生效，原因可能是 Phase 2 测试页 `throw new Error()` 是在 `setTimeout` 异步抛出，需要刷新页面后再等 1 秒
- 显示 `0 / 200 条`且永远不增 → 检查 `chrome.storage.onChanged` 监听是否成功（Service Worker 可能被回收，刷新 Side Panel 即可）

## 2. 一键复制段（约 3 分钟）

- [ ] 顶部出现两个按钮：「复制最新 1 条」/「复制最近 5 条」
- [ ] 每条错误条目右侧出现「复制」小按钮
- [ ] 点击「复制最新 1 条」→ 按钮文案 1.2 秒内变为「已复制」
- [ ] 粘贴到任意文本编辑器，输出格式形如：
  ```
  ### error @ HH:MM:SS
  [fixture] window.onerror: uncaught-throw
  file:///.../index.html
  ```
- [ ] 点击「复制最近 5 条」→ 粘贴后首行是 `Recent page errors (3)`，末尾是 `请基于以上错误分析根因并给出最小修复建议。`
- [ ] 关闭 Side Panel 再打开 → 列表从 storage 恢复

**预期**：复制内容 Markdown 格式正确；重新打开 Side Panel 数据不丢。  
**若失败**：

- 复制按钮点不动 → `navigator.clipboard.writeText` 在 `file://` 页面受限（Chrome 的 `clipboard-write` 权限默认只在 HTTPS/扩展页面允许）；通过 Chrome 旗 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 添加 `file:///Users/xiangyuanmeng/...` 作为安全源，或在 Options 页测试复制
- 粘贴出现控制字符 → 检查 `entrypoints/shared/format.ts` 中 `sanitize` 是否仍保留 `0x09 / 0x0a / 0x0d`（应保留这三个，仅去掉其他控制符）
- 重新打开 Side Panel 数据为空 → Service Worker 已被 Chrome 回收，`onInstalled` 不会再次触发；这是预期行为，去看 `chrome.storage.local.get("errors")` 应当返回缓存值

## 3. BYOK 配置段（约 5 分钟）

- [ ] 在扩展卡片点击「详细信息」→ 点击「扩展程序选项」（或在 Side Panel 顶部点「打开 Options」），打开 Options 页
- [ ] Options 页两个输入框分别显示 API Key（密码框）与 Proxy URL
- [ ] 输入一个长度 < 20 的假 Key，点「保存」→ 浏览器弹窗「API Key 长度不合理」
- [ ] 输入合法 Key（≥ 20 字符）与 `https://example.com/v1/chat`，点「保存」→ 显示「已保存」
- [ ] 在 Options 页输入 `http://localhost:1234/v1/chat`，点「保存」→ 弹窗「Proxy URL 不合法（需 http(s) 且公网主机）」
- [ ] 输入 `http://192.168.1.1/v1/chat`，点「保存」→ 同样弹窗拒绝
- [ ] 在 DevTools → Application → Storage → Extension Storage → Local → 展开 `settings` 项，可见 `apiKey` 与 `proxyUrl` 字段

**预期**：保存前校验生效；storage 中确实出现 `settings` 字段。  
**若失败**：

- 保存无反应 → 检查 `entrypoints/options/App.tsx` 的 `onSave` 是否调用 `setSettings`；检查 Service Worker 是否在 DevTools 中显示活动
- 校验不拦截 → 检查 `onSave` 内的 `try { new URL(...) }` 块是否被后续代码绕过
- storage 中无 `settings` 字段 → `chrome.storage.local.set` 在 Service Worker 未运行时不会执行；点击 Service Worker 的「检查视图：service worker」打开 DevTools 看 Console

## 4. Agent 调用段（依赖你的代理服务）（约 10 分钟）

> 这一段是否走得通，取决于你是否已有按下面契约运行的代理服务。如果代理不存在，第4.1 步必须先做；否则4.2 之后必然失败。

### 4.0 代理契约（扩展期望的请求/响应）

- 请求：`POST <proxyUrl>`，Header：`Content-Type: application/json`、`x-extension-origin: <chrome.runtime.id>`
- 请求体：`{ apiKey: string, model: "claude-3-5-sonnet-latest", messages: [{role:"user", content: string}], max_tokens: 1024 }`
- 响应：`{ content: string }`，HTTP 2xx
- 响应 Header：`Access-Control-Allow-Origin: chrome-extension://<id>`（如代理与扩展不同源；扩展自身页面在某些 Chromium 版本可豁免）
- 若代理未实现该契约：本节期望结果一定是失败，请记录实际错误码

### 4.1 准备代理（若无）

- [ ] 启动你的代理服务（你已经有的话）；如果未实现该契约，请先把 4.0 的请求/响应落地
- [ ] 代理绑定的 URL 是 Options 中已保存的公网 HTTPS（或公网 HTTP）地址

### 4.2 触发与验收

- [ ] 在 Side Panel 点「分析最近 5 条」按钮
- [ ] 按钮文案变为「分析中…」
- [ ] 在 `chrome://extensions` → 你的扩展 → 「Service Worker」→ DevTools → Network 面板，可以看到一个 `POST` 到代理 URL 的请求
- [ ] 请求 Header 包含 `x-extension-origin: <id>`（复制 Chrome 扩展 ID 校验）
- [ ] 请求体是合法 JSON，含 `apiKey` / `model` / `messages` / `max_tokens`
- [ ] 代理返回 2xx + `{ content: "..." }`
- [ ] Side Panel 显示来自 `content` 字段的文字
- [ ] 关闭代理 → 再点按钮 → Side Panel 显示错误文本（红色）：`proxy returned <status>`

**预期**：Service Worker 的 Network 面板可见请求；Side Panel 显示回复或具体错误。  
**若失败**：

- 请求未发出 → 检查 `entrypoints/background.ts` 中 `onMessage("ANALYZE")` 是否被路由；查看 Service Worker DevTools Console
- 请求发出但被 CORS 拦截 → 在请求的 DevTools Console 看 `CORS` 错误，需要在代理响应加 `Access-Control-Allow-Origin: chrome-extension://<id>`
- Side Panel 一直「分析中…」→ `sendResponse` 未被调用，回到 background 的 onMessage 是否最后一行 `return true`
- Side Panel 显示「missing api key」→ Options 没保存成功，回到步骤3

## 5. 安全修复验收（5 项，每项 1 分钟）

- [ ] **修复 1 (CORS)**：Service Worker Network 面板的代理请求 Header 含 `x-extension-origin`，且值与 `chrome.runtime.id` 一致
- [ ] **修复 2 (proxyUrl 校验)**：步骤3 中 `http://192.168.1.1/` 与 `http://localhost/` 都被拒绝
- [ ] **修复 3 (Key 不在 Side Panel Network)**：Side Panel DevTools Network 面板在「分析最近 5 条」时**没有**任何对外 HTTP 请求（请求在 Service Worker）
- [ ] **修复 4 (控制字符)**：在 `tests/error-pages/main.js` 临时加一行 `console.error("ab")`，刷新页面捕获，看 Side Panel 的复制内容不应出现 ``
- [ ] **修复 5 (storage 类型)**：在 DevTools 把 `settings.proxyUrl` 改为 `{}`，刷新 Side Panel，看「分析最近 5 条」应报「missing proxy url」而非抛异常

## 结果回填表

| 步骤 | 通过 / 未通过 | 备注（含失败原因 / 错误码 / 文件路径） |
| --- | --- | --- |
| 0. 环境准备 |  |  |
| 1. 捕获段 |  |  |
| 2. 一键复制 |  |  |
| 3. BYOK 配置 |  |  |
| 4.1 代理存在 |  |  |
| 4.2 Agent 调用 |  |  |
| 5. 安全 1 |  |  |
| 5. 安全 2 |  |  |
| 5. 安全 3 |  |  |
| 5. 安全 4 |  |  |
| 5. 安全 5 |  |  |

回填方式：直接把结果贴回聊天，我根据「未通过」项决定是否进入 Phase 5 与 Phase 5 的具体范围；全通过则进入下一步（README + code review）。