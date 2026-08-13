import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/*
 * 迁移期的开发配置。
 *
 * 生产产物目前不由这里直出：迁移阶段的产物是「保持 window 全局契约的 IIFE」，
 * 由 scripts/build-legacy-bundles.mjs 逐个入口构建后回填 static/js/dist/。
 * 等页面本身也迁到 SFC，再把这里切成正式的多页入口。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
