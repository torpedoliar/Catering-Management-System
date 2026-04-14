/**
 * Notification Service for Android (Capacitor Local Notifications)
 * 
 * Manages scheduled local notifications for meal order reminders.
 * Notifications are scheduled by the OS and will fire even if the app is closed.
 * 
 * Timing: 1 hour BEFORE the shift start time (not before cutoff).
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Notification channel ID for Android
const CHANNEL_ID = 'hallofood-reminders';
const REMINDER_MINUTES_BEFORE_SHIFT = 1500; // 25 hours before shift starts

// Base notification ID range
const REMINDER_ID_BASE = 1000;

interface ShiftInfo {
    id: string;
    name: string;
    cutoffTime: string | null;
    startTime: string;
    endTime: string;
    canOrder?: boolean;
}

export async function initNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const permResult = await LocalNotifications.requestPermissions();
        console.log('[Notifications] Permission:', permResult.display);
        
        if (permResult.display !== 'granted') {
            console.warn('[Notifications] Permission not granted — reminders disabled');
            return;
        }

        await LocalNotifications.createChannel({
            id: CHANNEL_ID,
            name: 'Pengingat Pemesanan Makan',
            description: 'Notifikasi pengingat sebelum waktu shift dimulai',
            importance: 4, 
            visibility: 1, 
            vibration: true,
            sound: 'default',
        });

        LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
            console.log('[Notifications] Tapped:', notification.notification.id);
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
 * Parses a time string "HH:mm" and returns a Date object for the given target date.
 */
function parseShiftTime(timeStr: string, targetDate: Date): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(targetDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
}

export async function rescheduleRemindersFromAPI(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
        const { default: axios } = await import('axios');
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        
        const API_URL = import.meta.env.VITE_API_URL || '';
        const { value: token } = await Preferences.get({ key: 'token' });

        if (!token) {
            console.log('[Notifications] No auth token — skipping reschedule');
            return;
        }

        // Cancel existing reminders first
        await cancelAllReminders();

        const now = new Date();
        const notificationsToSchedule: any[] = [];
        let notificationCount = 0;

        // Cek mode cutoff
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        let initialRes;
        try {
            initialRes = await axios.get(`${API_URL}/api/shifts/for-user?date=${todayStr}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (e) {
            console.warn('[Notifications] API Fetch Error during Init', e);
            return;
        }

        const data = initialRes.data;

        if (data.cutoffMode === 'weekly') {
            // Mode Mingguan — jadwalkan berdasarkan shift start time untuk setiap hari yang bisa dipesan
            // Fetch data 7 hari ke depan
            for (let i = 0; i < 7; i++) {
                const targetDate = new Date(now);
                targetDate.setDate(targetDate.getDate() + i);
                const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

                try {
                    const [shiftsRes, orderRes] = await Promise.all([
                        axios.get(`${API_URL}/api/shifts/for-user?date=${dateStr}`, { headers: { Authorization: `Bearer ${token}` } }),
                        axios.get(`${API_URL}/api/orders/today?date=${dateStr}`, { headers: { Authorization: `Bearer ${token}` } })
                    ]);

                    const hasOrder = !!orderRes.data.order;
                    if (hasOrder) continue; // Jangan beri notif jika pesanan sudah ada hari itu

                    const shifts: ShiftInfo[] = shiftsRes.data.shifts || [];
                    for (const shift of shifts) {
                        if (notificationsToSchedule.length >= 50) break;

                        // Jadwalkan 1 jam sebelum shift START
                        const shiftStartDate = parseShiftTime(shift.startTime, targetDate);
                        const reminderDate = new Date(shiftStartDate.getTime() - REMINDER_MINUTES_BEFORE_SHIFT * 60 * 1000);

                        if (reminderDate.getTime() > now.getTime()) {
                            const dayName = targetDate.toLocaleDateString('id-ID', { weekday: 'long' });
                            notificationsToSchedule.push({
                                id: REMINDER_ID_BASE + notificationCount++,
                                title: '🍽️ Jangan Lupa Pesan Makan',
                                body: `Tolong pesan untuk esok hari pada shift ${shift.name}. Waktu order akan segera ditutup!`,
                                schedule: { at: reminderDate },
                                channelId: CHANNEL_ID,
                                smallIcon: 'ic_stat_notify',
                                largeIcon: 'ic_launcher',
                                autoCancel: true,
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`[Notifications] Failed fetching for ${dateStr}`, e);
                }
            }
        } else {
            // Mode Per-Shift: Ambil 7 hari ke depan
            for (let i = 0; i < 7; i++) {
                const targetDate = new Date(now);
                targetDate.setDate(targetDate.getDate() + i);
                const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
                
                try {
                    const [shiftsRes, orderRes] = await Promise.all([
                        axios.get(`${API_URL}/api/shifts/for-user?date=${dateStr}`, { headers: { Authorization: `Bearer ${token}` } }),
                        axios.get(`${API_URL}/api/orders/today?date=${dateStr}`, { headers: { Authorization: `Bearer ${token}` } })
                    ]);

                    const hasOrder = !!orderRes.data.order;
                    if (hasOrder) continue; // Jangan beri notif jika pesanan sudah ada hari itu

                    const shifts: ShiftInfo[] = shiftsRes.data.shifts || [];
                    for (const shift of shifts) {
                        if (notificationsToSchedule.length >= 50) break;

                        // Jadwalkan 1 jam sebelum shift START (bukan sebelum cutoff)
                        const shiftStartDate = parseShiftTime(shift.startTime, targetDate);
                        const reminderDate = new Date(shiftStartDate.getTime() - REMINDER_MINUTES_BEFORE_SHIFT * 60 * 1000);

                        if (reminderDate.getTime() > now.getTime()) {
                            const dayName = targetDate.toLocaleDateString('id-ID', { weekday: 'long' });
                            notificationsToSchedule.push({
                                id: REMINDER_ID_BASE + notificationCount++,
                                title: '🍽️ Jangan Lupa Pesan Makan',
                                body: `Tolong pesan untuk esok hari pada shift ${shift.name}. Waktu order akan segera ditutup!`,
                                schedule: { at: reminderDate },
                                channelId: CHANNEL_ID,
                                smallIcon: 'ic_stat_notify',
                                largeIcon: 'ic_launcher',
                                autoCancel: true,
                            });
                        }
                    }
                } catch (e) {
                    console.warn(`[Notifications] Failed fetching logic for ${dateStr}`, e);
                }
            }
        }

        if (notificationsToSchedule.length > 0) {
            await LocalNotifications.schedule({ notifications: notificationsToSchedule });
            console.log(`[Notifications] Scheduled ${notificationsToSchedule.length} reminders (1h before shift start)`);
            notificationsToSchedule.forEach(n => {
                console.log(`  → [${n.id}] "${n.title}" at ${n.schedule.at.toLocaleString()}`);
            });
        } else {
            console.log('[Notifications] No reminders to schedule within 7 days');
        }

    } catch (error) {
        console.warn('[Notifications] Reschedule from API failed:', error);
    }
}

export async function cancelAllReminders(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const pending = await LocalNotifications.getPending();
        const reminderIds = pending.notifications
            .filter(n => n.id >= REMINDER_ID_BASE && n.id < REMINDER_ID_BASE + 200)
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
 * scheduleOrderReminders is deprecated in favor of unified logic on rescheduleRemindersFromAPI
 * Kept for signature compatibility if accidentally called.
 */
export async function scheduleOrderReminders(
    shifts: ShiftInfo[],
    hasOrderToday: boolean = false
): Promise<void> {
    await rescheduleRemindersFromAPI();
}
