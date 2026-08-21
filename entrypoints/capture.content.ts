import {
  INSPECT_ELEMENT,
  INSPECT_ELEMENT_REPLY,
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
      const msg = message as { type?: string; payload?: { selector?: string; requestId?: string } };
      if (msg?.type === INSPECT_ELEMENT) {
        const payload = msg.payload;
        if (!payload || typeof payload.selector !== "string" || typeof payload.requestId !== "string") {
          sendResponse({ ok: false, error: "bad payload" });
          return false;
        }
        window.postMessage(
          {
            source: MESSAGE_SOURCE,
            type: INSPECT_ELEMENT,
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
        | { source?: string; type?: string; payload?: { requestId?: string; result?: unknown } }
        | undefined;
      if (!data || data.source !== MESSAGE_SOURCE || data.type !== INSPECT_ELEMENT_REPLY) return;
      const payload = data.payload;
      if (!payload || typeof payload.requestId !== "string") return;
      void chrome.runtime.sendMessage({
        type: INSPECT_ELEMENT_REPLY,
        payload: { requestId: payload.requestId, result: payload.result },
      });
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as Partial<BridgeMessage> | undefined;
      if (!data || data.source !== MESSAGE_SOURCE || data.type !== MESSAGE_KIND.error) return;
      const payload = data.payload;
      if (!payload) return;
      void chrome.runtime.sendMessage({ type: PAGE_ERROR, payload });
    });
  },
});