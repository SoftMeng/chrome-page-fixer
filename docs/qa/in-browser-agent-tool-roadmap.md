# 浏览器内 AI Agent 能力地图（Chrome 扩展侧）

> 范围：前端调试 Agent 在 Chrome 扩展里**还能调用什么 Chrome API / DevTools 能力**，按事实陈述。
> 立场：本文件只负责"能力 + 落地方式 + 风险"，**不**写"我们要做什么、什么时候做"——后者在 `CLAUDE.md` §Post-MVP 候选。
> 证据等级标注沿用 `README.md` 的四级。

## 1. 能力分类（按 Chrome API 边界）

| 类别 | 落地方式 | 典型能力 | 风险等级 |
| --- | --- | --- | --- |
| DOM 读 | Content Script（ISOLATED 或 MAIN world） | querySelector / querySelectorAll / getBoundingClientRect / 元素属性 | **低**——只读，不写 |
| DOM 写 | Content Script 改 DOM | click / type / scroll / setAttribute / 节点增删 | **中**——影响页面，需用户感知 |
| 页面 JS 执行 | Content Script `eval` / `new Function`；或 `chrome.scripting.executeScript({world: 'MAIN'})` | 调用页面函数、读局部变量 | **高**——可访问闭包、token |
| 完整控制台级执行 | `chrome.debugger` + CDP `Runtime.evaluate` | 任意 JS、跨 frame、捕获返回值 | **高**——用户能看到"正在调试" |
| Network 观察 | `chrome.webRequest`（MV3 不能拿 body）/ `chrome.debugger` + CDP | URL / 方法 / 状态 / headers / timing / body | **中**——CDP 才能拿 body |
| Console 日志 | 重写 `console.*`（Content Script）+ CDP `Runtime.consoleAPICalled` | 全部 console 输出、来源行 | **低**——只读 |
| Storage | Content Script 读 `localStorage` / `sessionStorage` / IndexedDB；`chrome.cookies` API | 键值对、Cookie | **高**——含敏感凭据 |
| Performance | Content Script `PerformanceObserver` / `performance.*`；CDP `Performance` domain | LCP / FCP / CLS / 长任务 / 资源 timing | **低**——只读 |
| 截图 | `chrome.tabs.captureVisibleTab`（需 `activeTab`）/ CDP `Page.captureScreenshot` | base64 PNG、整页 | **中**——可视内容可能含敏感信息 |

## 2. 风险等级细分

- **低**：只读、不改变页面 / 浏览器状态、无感知副作用——MVP 后阶段可放开
- **中**：改变页面或读取较敏感数据——需要 UI 提示 + 用户感知
- **高**：可访问闭包 / token / 任意 JS 执行 / 跨 frame——CLAUDE.md §关键决策 2 明确"写操作 Tool 不默认开放"，必须域名白名单 + 二次确认 + 操作审计

## 3. 已知事实 vs 经验值 / 未验证

| 断言 | 等级 | 备注 |
| --- | --- | --- |
| Content Script（MAIN world）可访问页面 DOM 与全局变量 | 已确认 | Chrome MV3 文档 |
| `chrome.scripting.executeScript({world: 'MAIN'})` 能访问页面主世界 | 已确认 | Chrome MV3 文档 |
| `chrome.debugger` + CDP 可监听 `Network.requestWillBeSent` 等事件 | 已确认 | Chrome DevTools Protocol 文档 |
| `chrome.debugger` 权限使用时 Chrome 标签页显示"正在调试"提示 | 已确认 | Chrome UX 设计 |
| `chrome.webRequest` MV3 限制：拿不到 response body | 已确认 | MV3 限制清单 |
| `chrome.cookies` API 存在 | 已确认 | Chrome 文档 |
| `chrome.tabs.captureVisibleTab` 截屏需 `activeTab` 权限 | 已确认 | Chrome 文档 |
| "6-10 个 Tool 是舒适区，>15 个模型选错" | **经验值** | 无具体引用；不作为硬规则 |
| MVP 推荐 7 个 Tool（get_page_overview / get_console_logs / get_network_requests / inspect_element / get_dom_summary / execute_js / highlight_element） | **经验值** | 通用建议，不作为唯一真理 |
| "执行 JS / 改 DOM / 读 storage"等高权限操作必须二次确认 | **合理判断** | 与 CLAUDE.md §关键决策 2 一致；写入需走 `agent-safety.md` 评审 |

## 4. 不应直接采纳 / 与现状冲突的断言

| 断言 | 冲突 |
| --- | --- |
| Vercel AI SDK 引入仅 +60-80 kB | 实测 +374 kB（`background.js` 26 kB → 400 kB），已在 `CLAUDE.md` §Post-MVP 阶段 3 记录 |
| "工具粒度 8-14 个"为目标数 | 我们已合并 `search_errors_by_message` 到 `get_errors`，当前 4 个 Tool；8-14 不是目标，**是上限** |
| 把 MVP 推荐 7 个 Tool 当作"必须全部实现"清单 | 与 `CLAUDE.md` §Post-MVP 候选边界冲突；CLAUDE.md 才是路线图，本文件不是 |

## 5. 现状对照（事实层，不含"何时做"）

### 已落地（Post-MVP 阶段 1-3）

| Tool | 类别 | 落地方式 |
| --- | --- | --- |
| `get_errors` | DOM 读 + 错误缓冲读 | 直接读 `chrome.storage.local["errors"]` |
| `get_error_by_index` | 同上 | 同上 |
| `inspect_element` | DOM 读 | Content Script MAIN world `document.querySelector` + 桥接 |
| `list_elements` | DOM 读 | Content Script MAIN world `document.querySelectorAll` + 桥接 |

### 网络错误的"trigger 元数据"

- 由 Content Script 劫持 `fetch` / `XMLHttpRequest` 触发器并记录最近一次 `click` / `submit` / `keydown` 的 target
- 写入 `ErrorEntry.triggerSelector` / `triggerElement`
- 已交付（Post-MVP 阶段 1）

### webRequest 观察（不带 body）

- 用 `chrome.webRequest.onResponseStarted` 拿 4xx / 5xx 资源
- 写入 `ErrorEntry`，但**不**能拿 response body
- 已交付

### 内容脚本 → background 的真实页面上报

- Content Script 在 hashchange / pushState / popstate 时 postMessage `PAGE_CONTEXT`
- background 维护 `currentPageByTab: Map<tabId, {url, title, route}>`，enrich webRequest entry
- 已交付（Phase E）

### 未落地（按 CLAUDE.md §Post-MVP 候选 / §关键决策）

| 类别 | 状态 | 阻塞条件 |
| --- | --- | --- |
| 控制台日志（`get_console_logs`） | 未做 | 待观察需求 |
| Network 完整抓取（headers / timing / body via CDP） | 未做 | `debugger` 权限 UX 评估未完成 |
| Storage / Cookie 读取 | 未做 | 隐私边界需先写入 `privacy-and-consent.md` |
| 截图（`take_screenshot`） | 未做 | `activeTab` 权限与隐私披露需评审 |
| 写操作 Tool（`execute_js` / `click_element` / `type_text` / 修改 storage） | 未做 | CLAUDE.md §关键决策 2：必须先经 `agent-safety.md` 评审 |
| Performance 指标 | 未做 | 待观察需求 |
| 框架专用 Tool（React Fiber / Vue devtools） | 未做 | 增加 Tool 数后才有性价比 |

## 6. 出处

- 工具分类与设计要点：`in-browser-agent-extension-plan.md` §3.7、§4
- 写操作可靠性与高风险操作：`extension-pitfalls-and-best-practices.md` §3.3
- 实际选型与拒绝 / 接受依据：见本文 §4 表
- 项目内 Tool 设计原则：`docs/constraint/tool-design.md`
- 已落地 Tool schema 与执行：`entrypoints/agent/tools.ts`