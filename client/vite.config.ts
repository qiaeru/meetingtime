import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true, changeOrigin: true },
      "/yjs": { target: "http://localhost:3000", ws: true, changeOrigin: true },
      // PWA manifest is content-negotiated by the server (one file per locale).
      "/manifest.webmanifest": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../server/dist/public"),
    emptyOutDir: true,
    target: "es2022",
  },
});
