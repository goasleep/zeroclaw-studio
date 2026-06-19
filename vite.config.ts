import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";
import path from "node:path";

// Tauri's dev server expects a fixed port and CSP-safe HMR
// https://tauri.app/v1/guides/getting-started/setup/vite/
const host = process.env.TAURI_DEV_HOST;

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
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
  },
});
