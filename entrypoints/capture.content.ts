import {
  INSPECT_ELEMENT,
  INSPECT_ELEMENT_REPLY,
  LIST_ELEMENTS,
  LIST_ELEMENTS_REPLY,
  LIST_RESOURCE_TIMING,
  LIST_RESOURCE_TIMING_REPLY,
  GET_COMPUTED_STYLE,
  GET_COMPUTED_STYLE_REPLY,
  GET_STORAGE,
  GET_STORAGE_REPLY,
  GET_EVENT_LISTENERS,
  GET_EVENT_LISTENERS_REPLY,
  GET_PAGE_DOM_HTML,
  GET_PAGE_DOM_HTML_REPLY,
  GET_NAVIGATION_TIMING,
  GET_NAVIGATION_TIMING_REPLY,
  CONSOLE_LOG,
  CONSOLE_LOG_RECEIVED,
  PAGE_CONTEXT,
  PAGE_ERROR,
} from "./shared/messaging";
import {
  MESSAGE_KIND,
  MESSAGE_SOURCE,
  type BridgeMessage,
} from "./shared/types";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "ISOLATED",
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const msg = message as { type?: string; payload?: { selector?: string; requestId?: string; limit?: number } };
      if (msg?.type === INSPECT_ELEMENT || msg?.type === LIST_ELEMENTS) {
        const payload = msg.payload;
        if (!payload || typeof payload.requestId !== "string") {
          sendResponse({ ok: false, error: "bad payload" });
          return false;
        }
        window.postMessage(
          {
            source: MESSAGE_SOURCE,
            type: msg.type,
            payload,
          },
          window.location.origin,
        );
        return false;
      }
      if (msg?.type === LIST_RESOURCE_TIMING || msg?.type === GET_COMPUTED_STYLE || msg?.type === GET_STORAGE || msg?.type === GET_EVENT_LISTENERS || msg?.type === GET_PAGE_DOM_HTML || msg?.type === GET_NAVIGATION_TIMING) {
        const payload = msg.payload;
        if (!payload || typeof payload.requestId !== "string") {
          sendResponse({ ok: false, error: "bad payload" });
          return false;
        }
        window.postMessage(
          {
            source: MESSAGE_SOURCE,
            type: msg.type,
            payload,
          },
          window.location.origin,
        );
        return false;
      }
      return false;
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as
        | { source?: string; type?: string; payload?: unknown }
        | undefined;
      if (!data || data.source !== MESSAGE_SOURCE) return;
      if (data.type === INSPECT_ELEMENT_REPLY || data.type === LIST_ELEMENTS_REPLY || data.type === LIST_RESOURCE_TIMING_REPLY || data.type === GET_COMPUTED_STYLE_REPLY || data.type === GET_STORAGE_REPLY || data.type === GET_EVENT_LISTENERS_REPLY || data.type === GET_PAGE_DOM_HTML_REPLY || data.type === GET_NAVIGATION_TIMING_REPLY) {
        const payload = data.payload as { requestId?: string; result?: unknown } | undefined;
        if (!payload || typeof payload.requestId !== "string") return;
        void chrome.runtime.sendMessage({
          type: data.type,
          payload: { requestId: payload.requestId, result: payload.result },
        });
        return;
      }
      if (data.type === CONSOLE_LOG) {
        void chrome.runtime.sendMessage({ type: CONSOLE_LOG_RECEIVED, payload: data.payload });
        return;
      }
      if (data.type === PAGE_CONTEXT) {
        void chrome.runtime.sendMessage({ type: PAGE_CONTEXT, payload: data.payload });
        return;
      }
      if (data.type === MESSAGE_KIND.error) {
        const payload = data.payload;
        if (!payload) return;
        void chrome.runtime.sendMessage({ type: PAGE_ERROR, payload });
        return;
      }
    });
  },
});