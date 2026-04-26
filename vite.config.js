import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    sourcemap: false,
    minify: 'esbuild',
  },
  esbuild: mode === 'production'
    ? {
        // 生产环境去除所有 console 与 debugger，避免泄漏与 token / 提示词
        drop: ['console', 'debugger'],
      }
    : undefined,
}))
