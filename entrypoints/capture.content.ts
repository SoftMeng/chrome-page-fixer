import { MESSAGE_KIND, MESSAGE_SOURCE, type BridgeMessage } from "./shared/types";

const PAGE_ERROR = "PAGE_ERROR";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "ISOLATED",
  main() {
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