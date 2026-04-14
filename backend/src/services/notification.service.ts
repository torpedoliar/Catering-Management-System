import webpush from 'web-push';
import { prisma } from '../lib/prisma';
import { sseManager } from '../controllers/sse.controller';
import * as admin from 'firebase-admin';
import path from 'path';

try {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
    });
    console.log('[PushService] Initialized Firebase Admin for Native FCM Push');
} catch (error) {
    console.warn('[PushService] Firebase Admin not initialized. (Missing or invalid json)', error instanceof Error ? error.message : 'Unknown error');
}

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

            // 3. Dispatch Web Push and FCM if configured
            const subs = await prisma.pushSubscription.findMany({
                where: { userId }
            });

            if (subs.length > 0) {
                const webSubs = subs.filter(s => s.endpoint && s.p256dh && s.auth);
                const fcmSubs = subs.filter(s => s.fcmToken);

                // 3a. Dispatch Web Push
                if (publicVapidKey && privateVapidKey && webSubs.length > 0) {
                    const payload = JSON.stringify({
                        title,
                        body: message,
                        icon: '/vite.svg', // Assuming standard public icon
                        data: {
                            url: '/',
                            relatedId
                        }
                    });

                    const sendPromises = webSubs.map(sub => {
                        const pushSub = {
                            endpoint: sub.endpoint!,
                            keys: {
                                p256dh: sub.p256dh!,
                                auth: sub.auth!
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

                // 3b. Dispatch FCM Native Push
                if (admin.apps.length > 0 && fcmSubs.length > 0) {
                    const tokens = fcmSubs.map(s => s.fcmToken!);
                    
                    const fcmPayload = {
                        notification: {
                            title,
                            body: message,
                        },
                        data: {
                            url: '/',
                            relatedId: relatedId || '',
                        },
                        tokens: tokens
                    };

                    try {
                        const response = await admin.messaging().sendEachForMulticast(fcmPayload);
                        response.responses.forEach((res, idx) => {
                            if (!res.success) {
                                if (res.error?.code === 'messaging/invalid-registration-token' ||
                                    res.error?.code === 'messaging/registration-token-not-registered') {
                                    console.log('[PushService] Removing expired FCM token:', tokens[idx]);
                                    prisma.pushSubscription.deleteMany({ where: { fcmToken: tokens[idx] } }).catch(() => {});
                                } else {
                                    console.error('[PushService] FCM send error:', res.error);
                                }
                            }
                        });
                    } catch (error) {
                         console.error('[PushService] FCM Multicast error:', error instanceof Error ? error.message : error);
                    }
                }
            }

            return notification;
        } catch (error) {
            console.error('[NotificationService] Error notifying user:', error);
        }
    }

    /**
     * Broadcasts a notification to all Admin users.
     */
    static async notifyAdmins(title: string, message: string, type: NotificationType = 'INFO', relatedId?: string) {
        try {
            const admins = await prisma.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true }
            });

            const sendPromises = admins.map(admin => 
                this.notifyUser(admin.id, title, message, type, relatedId)
            );

            await Promise.allSettled(sendPromises);
        } catch (error) {
            console.error('[NotificationService] Error notifying admins:', error);
        }
    }
}
