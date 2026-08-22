# Agent 端到端验收清单（12 Tools）

> 用户填 AI 实际返回 + 通过/未通过。

## 测试页

| 用途 | URL |
|---|---|
| SPA 通用 | `https://spiritai.jiaomatech.com/` |
| 静态页 | `https://example.com/` |
| 404 网络 | `https://httpbin.org/status/404` |

## 场景表

| # | 输入（用户问） | 期望 Tool | 通过 | 失败模式 / 备注 |
|---|---|---|---|---|
| 1 | "现在有几条错误？" | `get_errors({})` | | |
| 2 | "网络错误里包含 502 的" | `get_errors({query:"502", kind:"network"})` | | |
| 3 | "#3 的 stack 是什么" | `get_error_by_index({index:3})` | | |
| 4 | "页面上 `.submit-btn` 是什么状态" | `inspect_element({selector:".submit-btn"})` | | |
| 5 | "页面上有几个按钮" | `list_elements({selector:"button", mode:"flat"})` | | |
| 6 | "那条 502 错误是在哪个页面捕获的？" | `get_error_by_index` → envelope `url`/`route` | | |
| 7 | "找一条含 image 的网络错误，再列出所有 `<img>`" | `get_errors({query:"image", kind:"network"})` → `list_elements({selector:"img", mode:"flat"})` | | |
| 8 | 清空错误列表后 "现在有几条错误？" | `get_errors({})` → `[]` | | |
| A | "页面有几个 `li`？" | `list_elements({selector:"li", mode:"flat", limit:10})` | | |
| D2 | "body 里 DOM 骨架是什么？" | `list_elements({mode:"tree", depth:3})` | | |
| E | DevTools `console.warn("test-warn")` 后问 "最近有什么 warn？" | `get_console_messages({level:"warn", limit:10})` | | |
| F | 访问 404 后 "有什么 4xx 请求？" | `get_network_log({minStatus:400})` | | |
| G | 访问 example.com 后 "哪些 script 加载超过 100ms？" | `get_resource_timing({type:"script", limit:20})` | | |
| H | "body 的 display 是什么？" | `get_computed_style({selector:"body"})` | | |
| I | localStorage 设 testKey=secret123 后 "localStorage 有什么？" | `get_storage_snapshot({scope:"local"})` → value 应为 `***` | | |
| I2 | 接 I "testKey 字段的具体值？" | `get_storage_snapshot({scope:"local", properties:["testKey"]})` → value 原样 | | |
| J | 某按钮带 `onclick`，问 "这按钮有什么事件监听？" | `get_event_listeners({selector:"..."})` | | |
| K | "页面 head 里有哪些 script？" | `get_page_dom_html({maxLength:5000})` → 模型从 `html` 字段抽 | | |
| L | 访问 example.com 后 "页面打开花了多久？TTFB 多少？" | `get_navigation_timing({})` | | |
| M | 触发 console.error 后 "这错误和页面上哪个元素有关？" | `get_error_by_index({index:1})` → `get_event_listeners({selector:...})` | | |
| N | "列出所有 click 监听 + form input + img + console error + 4xx 网络" | Tool 调满 5 轮后 SDK stop，模型答"未找全" | | |
| O | "这页的网络情况和资源加载情况" | `get_navigation_timing` + `get_resource_timing` + `get_network_log`（3 个不混） | | |
| P | 在 `chrome://newtab/` 问 "这页有什么？" | Tool 不崩溃 + 模型答"无内容" | | |

## 汇总

| 项 | 数 |
|---|---|
| 总场景 | 23 |
| 通过 | |
| 未通过 | |
| 未测 | |

## 关键失败信号（任一触发即查对应约束）

| 场景 | 信号 | 查 |
|---|---|---|
| I | 返回了原始 secret123 | `docs/constraint/privacy-and-consent.md §4.1` |
| K | 模型再去调 `get_resource_timing` | system-prompt Tool 边界 |
| L | FCP 为 null 但已触发 | `entrypoints/capture-main.content.ts` 时序 |
| N | Tool 调 6+ 次 | `entrypoints/agent/run.ts` `stopWhen` |
| O | 页面级/资源级/请求级混淆 | system-prompt |
