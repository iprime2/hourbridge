import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@core': resolve('src/core'),
        '@ui': resolve('src/ui'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      // electron-vite leaves the renderer unminified by default (≈960 kB); minifying it cuts
      // the bundle to about a third, which speeds up window start-up and shrinks the installer.
      minify: 'esbuild'
    }
  }
})
