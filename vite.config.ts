import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {                              // ← 新增 server 配置块
    proxy: {
      '/ws': {                           // 拦截所有 /ws 开头的请求
        target: 'ws://localhost:8000',   // 转发到 Python 后端
        ws: true,                        // 支持 WebSocket 协议升级
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
