import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Placeholder bundle id shared with the desktop app. Replace with the id registered in
  // App Store Connect before submitting (it must match your provisioning profile).
  appId: 'com.worldtimebuddy.app',
  appName: 'World Time Buddy',
  webDir: 'dist-mobile',
  ios: {
    // The web layer handles the notch/home-indicator itself via env(safe-area-inset-*).
    contentInset: 'never',
    // Our own containers scroll; stop the whole web view rubber-banding behind them.
    scrollEnabled: false,
    backgroundColor: '#f4f6fa'
  },
  plugins: {
    StatusBar: {
      // Draw under the status bar; the header pads itself with safe-area-inset-top.
      overlaysWebView: true
    }
  }
}

export default config
