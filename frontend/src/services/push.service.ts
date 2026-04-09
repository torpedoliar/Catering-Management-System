import { api } from '../contexts/AuthContext';

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
            
            console.log('Successfully subscribed to push notifications.');
            return true;
        } catch (error) {
            console.error('Error during push registration:', error);
            return false;
        }
    },

    getPermissionState() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
};
