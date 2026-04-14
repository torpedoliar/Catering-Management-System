import { api } from '../contexts/AuthContext';
import { Capacitor } from '@capacitor/core';


// Helper to convert base64 VAPID to Uint8Array
const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export const PushService = {
    async register() {
        if (Capacitor.isNativePlatform()) {
            return this.registerNativePush();
        }
        return this.registerWebPush();
    },

    async registerNativePush() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            
            let permStatus = await PushNotifications.checkPermissions();
            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }
            if (permStatus.receive !== 'granted') {
                console.warn('[PushService] Native push permission denied');
                return false;
            }

            await PushNotifications.removeAllListeners();

            return new Promise<boolean>((resolve) => {
                PushNotifications.addListener('registration', async (token) => {
                    console.log('[PushService] Native FCM Token received:', token.value);
                    try {
                        await api.post('/api/notifications/fcm-subscribe', { fcmToken: token.value });
                        resolve(true);
                    } catch (e) {
                         console.error('[PushService] Failed sending FCM token to backend', e);
                         resolve(false);
                    }
                });
                
                PushNotifications.addListener('registrationError', (error) => {
                    console.error('[PushService] Error on FCM registration:', error.error);
                    resolve(false);
                });

                // Finally, trigger registration
                PushNotifications.register().catch(e => {
                    console.error('[PushService] PushNotifications.register failed', e);
                    resolve(false);
                });
            });

        } catch (e) {
            console.error('[PushService] Error during native push registration', e);
            return false;
        }
    },

    async registerWebPush() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push notifications not supported by this browser.');
            return false;
        }

        try {
            // Register SW
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered with scope:', registration.scope);

            // Check if already subscribed
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                return true; // Already subscribed
            }

            // Ask for permission
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('Notification permission denied.');
                return false;
            }

            // Subscribe to push manager
            const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            
            if (!vapidPublicKey) {
                console.warn('VITE_VAPID_PUBLIC_KEY is not defined in environment.');
                return false;
            }

            const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
            });

            // Send to backend
            await api.post('/api/notifications/subscribe', subscription.toJSON());
            
            console.log('Successfully subscribed to web push notifications.');
            return true;
        } catch (error) {
            console.error('Error during web push registration:', error);
            return false;
        }
    },

    getPermissionState() {
        if (Capacitor.isNativePlatform()) {
             // Capacitor PushNotifications check
             return 'prompt'; // simplified
        }
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
};
