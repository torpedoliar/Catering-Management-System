import webpush from 'web-push';
import { prisma } from '../lib/prisma';
import { sseManager } from '../controllers/sse.controller';

// ---------------------------------------------------------
// PUSH CONFIGURATION
// ---------------------------------------------------------
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';
const email = process.env.VAPID_EMAIL || 'mailto:admin@hallofood.com';

if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails(email, publicVapidKey, privateVapidKey);
    console.log(`[PushService] Configured Web Push. Public Key: ${publicVapidKey.substring(0, 10)}...`);
} else {
    console.warn('[PushService] Web Push disabled: VAPID keys missing in environment.');
}

type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export class NotificationService {
    /**
     * Creates an in-app notification and dispatches real-time SSE + Web Push.
     */
    static async notifyUser(userId: string, title: string, message: string, type: NotificationType = 'INFO', relatedId?: string) {
        try {
            // 1. Save to database for history
            const notification = await prisma.notification.create({
                data: {
                    userId,
                    title,
                    message,
                    type,
                    relatedId
                }
            });

            // 2. Broadcast via SSE (so the Bell icon updates immediately if they are online)
            sseManager.broadcastToUser(userId, 'notification:new', { notification });

            // 3. Dispatch Web Push if configured
            if (publicVapidKey && privateVapidKey) {
                const subs = await prisma.pushSubscription.findMany({
                    where: { userId }
                });

                if (subs.length > 0) {
                    const payload = JSON.stringify({
                        title,
                        body: message,
                        icon: '/vite.svg', // Assuming standard public icon
                        data: {
                            url: '/',
                            relatedId
                        }
                    });

                    const sendPromises = subs.map(sub => {
                        const pushSub = {
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        };
                        return webpush.sendNotification(pushSub, payload).catch(async (err) => {
                            // If gone (410) or not found (404), the user unsubscribed natively, delete from DB
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                console.log('[PushService] Removing expired subscription:', sub.endpoint);
                                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                            } else {
                                console.error('[PushService] Failed sending to client:', err);
                            }
                        });
                    });

                    await Promise.allSettled(sendPromises);
                }
            }

            return notification;
        } catch (error) {
            console.error('[NotificationService] Error notifying user:', error);
        }
    }
}
