import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Builds the iOS web layer to `dist-mobile/`, which Capacitor copies into the native project. */
export default defineConfig({
  root: resolve('src/mobile'),
  // Relative asset URLs: Capacitor serves from capacitor://localhost, not a domain root.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@ui': resolve('src/ui'),
      '@mobile': resolve('src/mobile')
    }
  },
  optimizeDeps: {
    // Pre-bundle the Capacitor plugins at start-up. Discovered lazily, Vite re-optimises mid-session
    // and the already-open page then requests stale chunks (504 "Outdated Optimize Dep" → blank page).
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
    outDir: resolve('dist-mobile'),
    emptyOutDir: true,
    // WKWebView on iOS 15+ (Safari 15). Keeps output free of syntax it can't parse.
    target: 'safari15'
  },
  server: {
    host: true,
    port: 5174
  }
})
