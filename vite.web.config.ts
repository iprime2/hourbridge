import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { finalizeServiceWorker, LAZY_ASSET_DIR } from './scripts/lib/sw-build'

const outDir = resolve('dist-web')

/** After the files are written, stamp the emitted file list and a content hash into dist's sw.js. */
function serviceWorker(): Plugin {
  return {
    name: 'wtb-service-worker',
    apply: 'build',
    enforce: 'post',
    // writeBundle (not closeBundle) so a failed build reports its own error instead of ours.
    writeBundle() {
      const { buildId, precache } = finalizeServiceWorker(outDir)
      console.log(`service worker: build ${buildId}, ${precache.length} entries precached`)
    }
  }
}

/** The installable web app (PWA): one site that shows the desktop or the touch layout by device. */
export default defineConfig({
  root: resolve('src/web'),
  // Relative URLs: the site works at a domain root (Vercel) or under a sub-path (e.g. GitHub Pages).
  base: './',
  publicDir: resolve('src/web/public'),
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@ui': resolve('src/ui'),
      '@mobile': resolve('src/mobile'),
      '@renderer': resolve('src/renderer/src')
    }
  },
  optimizeDeps: {
    // Same reason as vite.mobile.config.ts: pre-bundle at start-up so the dev server never serves
    // stale optimised chunks (504 "Outdated Optimize Dep" → blank page).
    include: [
      '@capacitor/core',
      '@capacitor/filesystem',
      '@capacitor/haptics',
      '@capacitor/preferences',
      '@capacitor/share',
      '@capacitor/status-bar'
    ]
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: ['es2020', 'safari15'],
    rollupOptions: {
      output: {
        // The per-country holiday files get their own folder, so the service worker can leave them
        // out of its install list (and so a listing of dist-web/assets stays readable).
        chunkFileNames: (chunk) =>
          /[\\/]holidayData[\\/]countries[\\/]/.test(chunk.facadeModuleId ?? '')
            ? `${LAZY_ASSET_DIR}[name]-[hash].js`
            : 'assets/[name]-[hash].js'
      }
    }
  },
  server: { host: true, port: 5175 },
  preview: { port: 4175 }
})
