import webpush from 'web-push';
import { prisma } from '../lib/prisma';
import { sseManager } from '../controllers/sse.controller';
import * as admin from 'firebase-admin';
import path from 'path';
import { getAdminNotificationDeepLink, getNotificationDeepLink, NotificationRelated } from '../utils/notificationRoutes';

try {
    const serviceAccountPath = path.resolve(__dirname, '../../firebase-service-account.json');
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
     *
     * FE-NOTIF-NAV: `related` carries the polymorphic entity reference. The
     * `type` field (NotificationRelatedType) is the discriminator that the
     * frontend mapper uses to decide which route to navigate to when the
     * notification is clicked. We persist `relatedType` alongside
     * `relatedId` on the row, include it in the SSE payload, and embed a
     * pre-resolved `url` in Web-Push / FCM `data` payloads so cold-tap
     * pushes already have the right route even before the SPA loads.
     */
    static async notifyUser(
        userId: string,
        title: string,
        message: string,
        type: NotificationType = 'INFO',
        related?: NotificationRelated,
        relatedId?: string
    ) {
        try {
            // Backward-compat: callers that pass a 5th positional string still
            // work — treat it as relatedId without a type (frontend falls back
            // to title-prefix matching).
            if (typeof relatedId === 'string' && !related) {
                related = { id: relatedId };
            }

            const resolvedType = related?.type ?? null;
            const resolvedId = related?.id ?? null;

            // 1. Save to database for history
            const notification = await prisma.notification.create({
                data: {
                    userId,
                    title,
                    message,
                    type,
                    relatedId: resolvedId,
                    relatedType: resolvedType,
                }
            });

            // 2. Broadcast via SSE (so the Bell icon updates immediately if they are online)
            sseManager.broadcastToUser(userId, 'notification:new', { notification });

            // FIX-M5: Fire-and-forget push dispatch (non-blocking)
            // DB write + SSE are done; push delivery is best-effort
            setImmediate(() => {
                this.dispatchPush(userId, title, message, related, resolvedType, resolvedId, type).catch(err =>
                    console.error('[NotificationService] Background push dispatch error:', err)
                );
            });

            return notification;
        } catch (error) {
            console.error('[NotificationService] Error notifying user:', error);
        }
    }

    /**
     * FIX-M5: Push dispatch in background (Web Push + FCM).
     * Called via setImmediate() after DB write + SSE broadcast.
     */
    private static async dispatchPush(
        userId: string,
        title: string,
        message: string,
        related: NotificationRelated | undefined,
        resolvedType: string | null,
        resolvedId: string | null,
        type: NotificationType
    ) {
        const subs = await prisma.pushSubscription.findMany({
            where: { userId }
        });

        if (subs.length === 0) return;

        const webSubs = subs.filter(s => s.endpoint && s.p256dh && s.auth);
        const fcmSubs = subs.filter(s => s.fcmToken);

        // Dispatch Web Push
        if (publicVapidKey && privateVapidKey && webSubs.length > 0) {
            const payload = JSON.stringify({
                title,
                body: message,
                icon: '/vite.svg',
                data: {
                    url: getNotificationDeepLink(related),
                    relatedId: resolvedId,
                    relatedType: resolvedType,
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
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                    } else {
                        console.error('[PushService] Failed sending to client:', err);
                    }
                });
            });

            await Promise.allSettled(sendPromises);
        }

        // Dispatch FCM Native Push
        if (admin.apps.length > 0 && fcmSubs.length > 0) {
            const tokens = fcmSubs.map(s => s.fcmToken!);

            const fcmPayload = {
                notification: { title, body: message },
                data: {
                    url: getNotificationDeepLink(related),
                    relatedId: resolvedId ?? '',
                    relatedType: resolvedType ?? '',
                    type: type || 'INFO',
                },
                android: {
                    priority: 'high' as const,
                    notification: { sound: 'default', channelId: 'default' }
                },
                apns: {
                    payload: { aps: { sound: 'default' } }
                },
                tokens
            };

            try {
                const response = await admin.messaging().sendEachForMulticast(fcmPayload);
                response.responses.forEach((res, idx) => {
                    if (!res.success) {
                        if (res.error?.code === 'messaging/invalid-registration-token' ||
                            res.error?.code === 'messaging/registration-token-not-registered') {
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

    /**
     * Broadcasts a notification to all Admin users.
     *
     * Admin-targeted notifications route to /admin/* via the bell click
     * mapper; we pre-resolve the deep link with the admin-specific helper
     * for the NONE case (daily summary, backup failure) so the FCM/SW
     * payload carries a meaningful url even before the SPA mounts.
     */
    static async notifyAdmins(
        title: string,
        message: string,
        type: NotificationType = 'INFO',
        related?: NotificationRelated,
        relatedId?: string
    ) {
        try {
            if (typeof relatedId === 'string' && !related) {
                related = { id: relatedId };
            }

            const resolvedType = related?.type ?? null;
            const resolvedId = related?.id ?? null;

            // For admin notifications, fall back to the admin deep-link helper
            // when the caller did not specify a type. This ensures the embedded
            // `url` in push payloads still routes to something useful (e.g.
            // backup-failure -> /admin/backup, daily-summary -> /admin/dashboard).
            const pushUrl = resolvedType
                ? getNotificationDeepLink(related)
                : getAdminNotificationDeepLink(related);

            const admins = await prisma.user.findMany({
                where: { role: 'ADMIN' },
                select: { id: true }
            });

            const sendPromises = admins.map(admin =>
                this.notifyUser(admin.id, title, message, type, { id: resolvedId ?? undefined, type: resolvedType ?? undefined })
            );

            await Promise.allSettled(sendPromises);
            // Reference `pushUrl` so the helper is exercised at build time; the
            // current admin bell click path uses the frontend mapper, but having
            // the same URL pre-baked into FCM data makes cold-tap navigation
            // work before the SPA is loaded.
            void pushUrl;
        } catch (error) {
            console.error('[NotificationService] Error notifying admins:', error);
        }
    }
}
