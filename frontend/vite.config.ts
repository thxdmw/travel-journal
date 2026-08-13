import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/*
 * 页面层迁移的正式多页构建。公开站和管理后台各有一个 HTML/ESM 入口，
 * 目前入口仍按旧顺序引入页面 IIFE；后续可以在同一构建链路内逐页换成 SFC。
 */
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // SFC 与旧页面共用 vendor/vue 的同一个运行时，避免页面里出现两份 Vue。
      { find: /^vue$/, replacement: resolve(root, 'src/vendor/vue-global.ts') },
      // 迁移期继续复用页面先加载的 vendor/axios，不重复打包 Axios。
      { find: /^axios$/, replacement: resolve(root, 'src/vendor/axios-global.ts') },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    manifest: true,
    rollupOptions: {
      input: {
        public: resolve(root, 'index.html'),
        admin: resolve(root, 'admin/index.html'),
      },
      output: {
        entryFileNames: 'app-assets/[name]-[hash].js',
        chunkFileNames: 'app-assets/[name]-[hash].js',
        assetFileNames: 'app-assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
