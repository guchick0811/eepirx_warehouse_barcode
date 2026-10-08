import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages 會把網站放在 /<repo>/ 之下；建置時由 VITE_BASE 指定，本機開發用 /
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  build: { target: "es2022", sourcemap: false },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/*.png", "icons/*.svg"],
      manifest: {
        name: "倉儲掃碼查詢",
        short_name: "倉儲掃碼",
        description: "倉儲部商品條碼查詢",
        lang: "zh-TW",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // 只預快取 APP 外殼（含本機打包的 wasm）。不設 runtimeCaching：
        // 對 Supabase 的所有請求一律走網路，登入回應與商品資料不會進 Cache Storage。
        globPatterns: ["**/*.{js,css,html,wasm,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
