/**
 * Notification Service for Android (Capacitor Local Notifications)
 * 
 * Manages scheduled local notifications for meal order reminders.
 * Notifications are scheduled by the OS and will fire even if the app is closed.
 */

import { Capacitor } from '@capacitor/core';

// Notification channel ID for Android
const CHANNEL_ID = 'hallofood-reminders';
const REMINDER_MINUTES_BEFORE_CUTOFF = 30;

// Base notification ID range for order reminders (1000-1999)
const REMINDER_ID_BASE = 1000;

interface ShiftInfo {
    id: string;
    name: string;
    cutoffTime: string; // "HH:mm" format
    startTime: string;
    endTime: string;
}

/**
 * Initialize notification permissions and channels.
 * Call once at app startup.
 */
export async function initNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');

        // Request permission (Android 13+ requires explicit permission)
        const permResult = await LocalNotifications.requestPermissions();
        console.log('[Notifications] Permission:', permResult.display);

        if (permResult.display !== 'granted') {
            console.warn('[Notifications] Permission not granted — reminders disabled');
            return;
        }

        // Create notification channel for Android
        await LocalNotifications.createChannel({
            id: CHANNEL_ID,
            name: 'Pengingat Pemesanan Makan',
            description: 'Notifikasi pengingat sebelum waktu pemesanan habis',
            importance: 4, // HIGH
            visibility: 1, // PUBLIC
            vibration: true,
            sound: 'default',
        });

        // Listen for notification actions (tap)
        LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
            console.log('[Notifications] Tapped:', notification.notification.id);
            // App is already opened when user taps — navigate to order page
            if (typeof window !== 'undefined') {
                window.location.hash = '/';
            }
        });

        console.log('[Notifications] Initialized successfully');
    } catch (error) {
        console.warn('[Notifications] Init failed:', error);
    }
}

/**
 * Schedule order reminder notifications based on shift cutoff times.
 * Cancels existing reminders and reschedules with fresh data.
 * 
 * @param shifts - Array of shifts with cutoff times
 * @param hasOrderToday - Whether user already has an order for today
 */
export async function scheduleOrderReminders(
    shifts: ShiftInfo[],
    hasOrderToday: boolean = false
): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');

        // Cancel all existing reminders first
        await cancelAllReminders();

        // Don't schedule if user already has order for today
        if (hasOrderToday) {
            console.log('[Notifications] User has order today — skipping reminders');
            return;
        }

        const now = new Date();
        const notifications: Array<{
            id: number;
            title: string;
            body: string;
            schedule: { at: Date };
            channelId: string;
            smallIcon: string;
            largeIcon: string;
            autoCancel: boolean;
        }> = [];

        shifts.forEach((shift, index) => {
            if (!shift.cutoffTime) return;

            // Parse cutoff time (HH:mm)
            const [hours, minutes] = shift.cutoffTime.split(':').map(Number);
            const cutoffDate = new Date(now);
            cutoffDate.setHours(hours, minutes, 0, 0);

            // Calculate reminder time (30 min before cutoff)
            const reminderDate = new Date(cutoffDate.getTime() - REMINDER_MINUTES_BEFORE_CUTOFF * 60 * 1000);

            // Only schedule if reminder time is in the future
            if (reminderDate.getTime() > now.getTime()) {
                notifications.push({
                    id: REMINDER_ID_BASE + index,
                    title: '🍽️ Jangan Lupa Pesan Makan!',
                    body: `Waktu pemesanan ${shift.name} (${shift.startTime}-${shift.endTime}) akan habis dalam ${REMINDER_MINUTES_BEFORE_CUTOFF} menit`,
                    schedule: { at: reminderDate },
                    channelId: CHANNEL_ID,
                    smallIcon: 'ic_stat_notify',
                    largeIcon: 'ic_launcher',
                    autoCancel: true,
                });
            }
        });

        if (notifications.length > 0) {
            await LocalNotifications.schedule({ notifications });
            console.log(`[Notifications] Scheduled ${notifications.length} reminders`);
            notifications.forEach(n => {
                console.log(`  - ${n.body} at ${n.schedule.at.toLocaleTimeString()}`);
            });
        } else {
            console.log('[Notifications] No future reminders to schedule');
        }
    } catch (error) {
        console.warn('[Notifications] Schedule failed:', error);
    }
}

/**
 * Cancel all scheduled order reminders.
 */
export async function cancelAllReminders(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');

        // Get pending notifications and cancel reminder-range ones
        const pending = await LocalNotifications.getPending();
        const reminderIds = pending.notifications
            .filter(n => n.id >= REMINDER_ID_BASE && n.id < REMINDER_ID_BASE + 100)
            .map(n => ({ id: n.id }));

        if (reminderIds.length > 0) {
            await LocalNotifications.cancel({ notifications: reminderIds });
            console.log(`[Notifications] Cancelled ${reminderIds.length} reminders`);
        }
    } catch (error) {
        console.warn('[Notifications] Cancel failed:', error);
    }
}

/**
 * Schedule reminders by fetching shift data from API.
 * Used for reschedule on app resume, boot, etc.
 */
export async function rescheduleRemindersFromAPI(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        // Dynamically import to avoid circular deps
        const { default: axios } = await import('axios');

        const API_URL = import.meta.env.VITE_API_URL || '';
        const token = localStorage.getItem('token');

        if (!token) {
            console.log('[Notifications] No auth token — skipping reschedule');
            return;
        }

        // Helper to format date as YYYY-MM-DD in local timezone
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const [shiftsRes, orderRes] = await Promise.all([
            axios.get(`${API_URL}/api/shifts/for-user?date=${dateStr}`, {
                headers: { Authorization: `Bearer ${token}` }
            }),
            axios.get(`${API_URL}/api/orders/today?date=${dateStr}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
        ]);

        const shifts: ShiftInfo[] = (shiftsRes.data.shifts || []).map((s: any) => ({
            id: s.id,
            name: s.name,
            cutoffTime: s.cutoffTime,
            startTime: s.startTime,
            endTime: s.endTime,
        }));

        const hasOrderToday = !!orderRes.data.order;

        await scheduleOrderReminders(shifts, hasOrderToday);
    } catch (error) {
        console.warn('[Notifications] Reschedule from API failed:', error);
    }
}
