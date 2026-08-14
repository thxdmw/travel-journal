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
        /*
         * 只给 JS 分包，CSS 一律跟着引用它的入口走。
         *
         * 把样式也塞进 vendor chunk 会带来一条隐蔽的依赖边：为了保住 CSS 的执行顺序，
         * Rollup 让后引入的 leaflet chunk 去 import 先引入的 element-plus chunk。
         * 于是只用到地图的公开首页，被顺带拖上了 873KB 的 Element Plus——而公开端
         * 一个 el-* 组件都没有用。
         */
        manualChunks(id) {
          if (id.endsWith('.css')) return
          /*
           * Element Plus 不单独分包，直接留在后台入口里。
           *
           * 它只有后台在用，独立成 chunk 换不来任何跨入口复用；反而因为 Rollup 要保住
           * 模块执行顺序，会让同样被拆出去的 leaflet chunk import 它一下——公开首页
           * 只是想画张地图，却被这条依赖边捎上了 873KB。
           */
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/vue-router/')) return 'vue'
          if (id.includes('/node_modules/axios/')) return 'axios'
          if (id.includes('/node_modules/leaflet/')) return 'leaflet'
        },
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
