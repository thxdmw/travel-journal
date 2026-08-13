import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/* 公开站、管理后台与主题卡片预览共用的 Vite 多页 ESM 构建。 */
const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [{ find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
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
        themeCardPreview: resolve(root, 'theme-card-preview.html'),
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
