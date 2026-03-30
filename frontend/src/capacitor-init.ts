/**
 * Capacitor Native Initialization
 *
 * This file initializes Capacitor-specific features when running inside
 * the native Android (or iOS) app. It is safe to import in web builds —
 * all Capacitor calls are guarded by `Capacitor.isNativePlatform()`.
 */

import { Capacitor } from '@capacitor/core';

/**
 * Initialize all Capacitor native features.
 * Call this once at app startup (main.tsx).
 */
export async function initCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return; // Running in browser — skip native init
  }

  console.log('[Capacitor] Running on native platform:', Capacitor.getPlatform());

  // 1. Setup Android back button handling
  await setupBackButton();

  // 2. Style the status bar
  await setupStatusBar();

  // 3. Hide splash screen (auto-hidden after launchShowDuration, but this ensures it)
  await hideSplashScreen();

  // 4. Initialize notifications
  await setupNotifications();

  // 5. Setup app state listener for notification reschedule
  await setupAppStateListener();
}

/**
 * Handle Android hardware back button.
 * Uses browser history navigation instead of closing the app.
 * Only exits the app when at the root page (login or home).
 */
async function setupBackButton(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        // At root — confirm exit
        App.exitApp();
      }
    });

    console.log('[Capacitor] Back button handler registered');
  } catch (error) {
    console.warn('[Capacitor] Failed to setup back button:', error);
  }
}

/**
 * Style the Android status bar to match the app's dark theme.
 */
async function setupStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');

    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0f172a' });

    console.log('[Capacitor] Status bar styled');
  } catch (error) {
    console.warn('[Capacitor] Failed to setup status bar:', error);
  }
}

/**
 * Ensure splash screen is hidden after app is ready.
 */
async function hideSplashScreen(): Promise<void> {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');

    // Small delay to ensure the WebView has loaded content
    setTimeout(async () => {
      await SplashScreen.hide();
      console.log('[Capacitor] Splash screen hidden');
    }, 500);
  } catch (error) {
    console.warn('[Capacitor] Failed to hide splash screen:', error);
  }
}

/**
 * Initialize local notifications for order reminders.
 * Requests permission and sets up notification channel.
 */
async function setupNotifications(): Promise<void> {
  try {
    const { initNotifications, rescheduleRemindersFromAPI } = await import('./services/notification-service');

    await initNotifications();

    // Schedule reminders on startup (with small delay for auth to be ready)
    setTimeout(() => {
      rescheduleRemindersFromAPI();
    }, 3000);

    console.log('[Capacitor] Notifications initialized');
  } catch (error) {
    console.warn('[Capacitor] Failed to setup notifications:', error);
  }
}

/**
 * Listen for app state changes to reschedule notifications
 * when app resumes from background.
 */
async function setupAppStateListener(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');

    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('[Capacitor] App resumed — reschedule notifications');
        try {
          const { rescheduleRemindersFromAPI } = await import('./services/notification-service');
          await rescheduleRemindersFromAPI();
        } catch (error) {
          console.warn('[Capacitor] Failed to reschedule notifications on resume:', error);
        }
      }
    });

    console.log('[Capacitor] App state listener registered');
  } catch (error) {
    console.warn('[Capacitor] Failed to setup app state listener:', error);
  }
}
