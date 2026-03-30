import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.id.santosjayaabadi.hallofood',
  appName: 'HalloFood',
  webDir: 'dist',
  server: {
    // Load from production URL directly (WebView wrapper approach)
    url: 'https://hallofood.santosjayaabadi.co.id',
    cleartext: false,
    // Use https scheme to avoid WebView buffering SSE responses
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    // Custom user agent to identify mobile app requests
    appendUserAgent: 'HalloFood-Android',
    // Enable WebView debugging (remove for production release)
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: true,
      spinnerColor: '#06b6d4',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#06b6d4',
      sound: 'default',
    },
  },
};

export default config;

