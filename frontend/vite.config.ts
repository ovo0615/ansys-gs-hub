import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本專案專屬固定埠；strictPort 確保埠被佔用時直接報錯，不會偷偷跳到別的埠／別的網站。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5193,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8017", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8017", ws: true },
    },
  },
});
