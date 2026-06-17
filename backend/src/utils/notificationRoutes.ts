/**
 * FE-NOTIF-NAV: Server-of-record deep-link helper for notifications.
 *
 * The frontend (`frontend/src/utils/notificationRoutes.ts`) has a parallel
 * switch on `relatedType` to decide where to navigate when a notification
 * is clicked. This module is the backend mirror — used in two places:
 *   1. As a source of truth that documents the routing contract in one
 *      place, so backend and frontend never disagree on the path for a
 *      given entity type.
 *   2. To pre-resolve the `url` field in Web-Push / FCM `data` payloads,
 *      so a service worker handling a cold-tap FCM already has the right
 *      path even before the SPA bundle finishes loading.
 *
 * If you change a mapping here, update `notificationRoutes.ts` on the
 * frontend in the same commit.
 */

export type NotificationRelatedType = 'ORDER' | 'BLACKLIST' | 'MESSAGE' | 'NONE';

export interface NotificationRelated {
    id?: string | null;
    type?: NotificationRelatedType | null;
}

/**
 * Resolve a notification to the route a click/tap should land on.
 *
 * @param related  Optional polymorphic reference carried by the notification.
 *                 `type` is the discriminator; `id` is informational only.
 * @returns        An in-app route path (always starts with `/`).
 */
export function getNotificationDeepLink(
    related?: NotificationRelated | null
): string {
    if (!related || !related.type) {
        return '/';
    }

    switch (related.type) {
        case 'ORDER':
            return '/history';
        case 'BLACKLIST':
            return '/settings';
        case 'MESSAGE':
            return '/admin/messages';
        case 'NONE':
        default:
            return '/';
    }
}

/**
 * Resolve a notification to an admin route when the caller is known to be
 * an admin. Use this for the admin-only notification categories (daily
 * no-show summary, backup failure, etc.) so they route to the meaningful
 * page instead of the user-facing `/` fallback.
 *
 * Note: the bell component handles role-gating for user-side routing, so
 * this helper is only used to disambiguate `NONE` for admins.
 */
export function getAdminNotificationDeepLink(
    related?: NotificationRelated | null
): string {
    if (!related || !related.type) {
        return '/admin/dashboard';
    }

    switch (related.type) {
        case 'ORDER':
            return '/history';
        case 'BLACKLIST':
            return '/admin/blacklist';
        case 'MESSAGE':
            return '/admin/messages';
        case 'NONE':
        default:
            return '/admin/dashboard';
    }
}
