import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


/**
 * Vite 自定义插件：Figma 资源路径解析器
 * 将由 Figma 设计稿导出的虚拟模块路径 "figma:asset/xxx" 映射到本地 src/assets 目录下的实际文件
 * 例如：import img from "figma:asset/logo.png" → src/assets/logo.png
 */
function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver', // 插件名称，用于调试和日志标识
    /**
     * Vite 的 resolveId 钩子：拦截模块导入路径，自定义路径解析逻辑
     * @param id - 被导入的模块标识符，如 "figma:asset/icon.svg"
     * @returns 解析后的绝对文件路径，若不需要处理则返回 undefined
     */
    resolveId(id) {
      // 仅处理以 "figma:asset/" 开头的虚拟导入路径（Figma Make 导出的资源引用格式）
      if (id.startsWith('figma:asset/')) {
        // 去掉虚拟前缀 "figma:asset/"，提取实际文件名
        const filename = id.replace('figma:asset/', '')
        // 拼接为项目 src/assets 目录下的绝对路径
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  // wind-monitoring v2 后端地址：本地沙盒默认 8101，可用 VITE_API_TARGET 覆盖
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:8101'

  return {
    plugins: [
      figmaAssetResolver(),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      proxy: {
        // AI 诊断后端（独立服务）
        '/ws': {
          target: 'ws://localhost:8000',
          ws: true,
        },
        // wind-monitoring v2：/wind-v2/api/* → 后端 /api/*（HTTP + WS）
        '/wind-v2': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (p) => p.replace(/^\/wind-v2/, ''),
        },
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})