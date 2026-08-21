import { defineConfig } from "wxt";

export default defineConfig({
  manifest: ({ browser }) => ({
    name: "Chrome Page Fixer",
    description:
      "Capture page errors and analyse them inside an in-extension agent.",
    version: "0.1.0",
    permissions: ["sidePanel", "storage", "scripting", "activeTab", "webRequest"],
    host_permissions: ["<all_urls>"],
    side_panel: {
      default_path: "sidepanel/index.html",
    },
    options_ui: {
      page: "options/index.html",
      open_in_tab: true,
    },
  }),
});