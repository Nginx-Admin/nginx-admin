import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 构建产物输出到 dist/，供 Go embed 内嵌。
// 开发时 /api 代理到后端 8080。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
});
