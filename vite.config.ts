import { defineConfig } from "vite";
import type { AliasOptions } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";
import path from "node:path";

// Tauri's dev server expects a fixed port and CSP-safe HMR
// https://tauri.app/v1/guides/getting-started/setup/vite/
const host = process.env.TAURI_DEV_HOST;
const browserE2e = process.env.E2E_BROWSER_MODE === "1";
const e2eGatewayTarget = process.env.VITE_E2E_GATEWAY_BASE_URL;

const browserE2eAliases: AliasOptions = browserE2e
  ? [
      {
        find: "@/api/tauri",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/tauri.ts"),
      },
      {
        find: "@tauri-apps/api/event",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/event.ts"),
      },
      {
        find: "@tauri-apps/api/window",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/window.ts"),
      },
      {
        find: "@tauri-apps/plugin-clipboard-manager",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/clipboard.ts"),
      },
      {
        find: "@tauri-apps/plugin-deep-link",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/deep-link.ts"),
      },
      {
        find: "@tauri-apps/plugin-dialog",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/dialog.ts"),
      },
      {
        find: "@tauri-apps/plugin-global-shortcut",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/global-shortcut.ts"),
      },
      {
        find: "@tauri-apps/plugin-notification",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/notification.ts"),
      },
      {
        find: "@tauri-apps/plugin-store",
        replacement: path.resolve(__dirname, "./tests/e2e/browser/stubs/store.ts"),
      },
    ]
  : [];

export default defineConfig({
  plugins: [
    react({
      plugins: [
        [
          "@lingui/swc-plugin",
          {
            runtimeModules: {
              i18n: ["@lingui/core", "i18n"],
              Trans: ["@lingui/react", "Trans"],
              useLingui: ["@lingui/react", "useLingui"],
            },
            descriptorFields: "auto",
          },
        ],
      ],
    }),
    lingui(),
    tailwindcss(),
  ],
  resolve: {
    alias: [...browserE2eAliases, { find: "@", replacement: path.resolve(__dirname, "./src") }],
  },
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 5184 } : undefined,
    watch: {
      // Tauri output dirs that should never trigger HMR
      ignored: ["**/src-tauri/**"],
    },
    proxy:
      browserE2e && e2eGatewayTarget
        ? {
            "/api": {
              target: e2eGatewayTarget,
              changeOrigin: true,
            },
            "/health": {
              target: e2eGatewayTarget,
              changeOrigin: true,
            },
          }
        : undefined,
  },
});
