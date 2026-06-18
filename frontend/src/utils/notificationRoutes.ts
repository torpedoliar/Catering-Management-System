/**
 * FE-NOTIF-NAV: Notification → route mapper for "navigate on click".
 *
 * Source of truth for the in-app navigation target of every notification
 * the system creates. Mirrors the backend helper in
 * `backend/src/utils/notificationRoutes.ts` — if you change a mapping here,
 * change it there in the same commit.
 *
 * Three exports:
 *   1. `Notification` type — extended shape with the polymorphic
 *      `relatedType` discriminator that the backend now persists.
 *   2. `notificationToRoute(n, userRole?)` — pure function. Returns the
 *      route string. Optionally role-gates `/admin/*` so a stray MESSAGE
 *      notification on a non-admin bell doesn't 403.
 *   3. `navigateToNotification(n)` — side-effecting helper. Dispatches a
 *      `hallofood:navigate` window CustomEvent consumed by
 *      `<GlobalNavListener />` mounted in `App.tsx`. Cold-start safe: also
 *      stashes the route in `sessionStorage.pendingNav` so a FCM cold-tap
 *      that fires before React mounts is replayed on the first render.
 */

export type NotificationRelatedType = 'ORDER' | 'BLACKLIST' | 'MESSAGE' | 'NONE';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
    isRead: boolean;
    createdAt: string;
    relatedId?: string | null;
    relatedType?: NotificationRelatedType | null;
}

/**
 * Title-prefix fallback for legacy rows that pre-date the `relatedType`
 * column. The patterns here MUST match the `UPDATE` block in the
 * `notification_related_type` migration so the two never disagree.
 */
function titlePrefixToRoute(title: string): NotificationRelatedType | null {
    if (
        title.startsWith('⚠️ Pelanggaran') ||
        title.startsWith('❌ Pesanan Dibatalkan') ||
        title.startsWith('Sanggahan Disetujui') ||
        title.startsWith('Sanggahan Ditolak')
    ) return 'ORDER';
    if (
        title.startsWith('🚫 Akun Diblokir') ||
        title.startsWith('🚫 User Auto-Blacklist')
    ) return 'BLACKLIST';
    if (title.startsWith('Pengajuan Sanggahan')) return 'MESSAGE';
    if (title.startsWith('📊 Laporan No-Show Harian')) return 'NONE'; // admin
    if (title.startsWith('Auto Backup Gagal')) return 'NONE';         // admin
    return null;
}

/**
 * Resolve a notification to the route a click/tap should land on.
 * Pure, no React imports — call from anywhere.
 *
 * Deep-link contract: routes MAY carry an `?id=<relatedId>` (and an
 * optional `&ref=notification:<notificationId>`) so the destination
 * page can auto-focus the related entity. The bell / SSE / FCM code
 * paths in `notificationToUrl` handle the legacy / cold-tap case
 * where only a plain route is available.
 */
export function notificationToRoute(
    n: Pick<Notification, 'relatedType' | 'relatedId' | 'title'>,
    userRole?: string
): string {
    const explicit = n.relatedType ?? null;
    const fallback = explicit ? null : titlePrefixToRoute(n.title);
    const type: NotificationRelatedType = explicit ?? fallback ?? 'NONE';
    const id = n.relatedId ?? null;

    const withId = (base: string): string => {
        if (!id) return base;
        return `${base}?id=${encodeURIComponent(id)}`;
    };

    let route: string;
    switch (type) {
        case 'ORDER':
            route = withId('/history');
            break;
        case 'BLACKLIST':
            // For USER-facing blacklist notifications we land on the user
            // settings page (banner). For ADMIN callers, the admin page
            // is more useful — see `notificationToRoute` admin branch.
            route = userRole === 'ADMIN' ? withId('/admin/blacklist') : withId('/settings');
            break;
        case 'MESSAGE':
            route = withId('/admin/messages');
            break;
        case 'NONE':
        default:
            route = '/';
            break;
    }

    // Role gate: keep the user inside the SPA. A non-admin seeing a
    // MESSAGE / admin-summary notification falls back to the user home.
    if (userRole && userRole !== 'ADMIN' && route.startsWith('/admin/')) {
        return id ? `/?id=${encodeURIComponent(id)}` : '/';
    }
    return route;
}

/**
 * Convert a (possibly plain) route that was emitted by the backend
 * deep-link helper (e.g. `/admin/blacklist`) into a deep-link that
 * also carries the `?id=` for the destination page to consume.
 * Pure, idempotent.
 */
export function notificationToUrl(
    route: string,
    relatedId?: string | null,
    relatedType?: NotificationRelatedType | null
): string {
    if (!route || !route.startsWith('/')) return '/';
    if (!relatedId) return route;
    if (route.includes('?id=')) return route; // already deep-linked
    return `${route}?id=${encodeURIComponent(relatedId)}`;
}

/**
 * Side-effecting navigation entry point. Safe to call before React mounts
 * (cold-start FCM tap) — it stashes the route in sessionStorage and the
 * `<GlobalNavListener />` in App.tsx will replay it on mount.
 */
export function navigateToNotification(
    n: Partial<Notification> & { relatedType?: NotificationRelatedType | null; relatedId?: string | null }
): void {
    // Read user role from auth context if present. Lazy import to avoid a
    // circular dep with contexts/AuthContext (which itself imports from
    // this file via SSEContext for toast onClick).
    let userRole: string | undefined;
    try {
        const raw = localStorage.getItem('user');
        if (raw) {
            const parsed = JSON.parse(raw);
            userRole = parsed?.role;
        }
    } catch {
        // No user in localStorage — fall through with undefined role.
    }

    const route = notificationToRoute(
        {
            relatedType: n.relatedType ?? null,
            relatedId: n.relatedId ?? null,
            title: n.title ?? '',
        },
        userRole
    );

    if (typeof window === 'undefined') return;

    // Stash for cold-start replays. Cleared by GlobalNavListener on consume.
    try {
        sessionStorage.setItem('pendingNav', route);
    } catch {
        // sessionStorage unavailable (private mode, etc.) — best-effort.
    }

    window.dispatchEvent(new CustomEvent('hallofood:navigate', { detail: route }));
}

/**
 * Helper for the rare case where a native push payload carries only a
 * pre-resolved `url` (e.g. the FCM `data.url` we baked in on the
 * backend). Dispatches it as-is, after the same role gate. Falls back to
 * `/` if `url` is missing or non-app.
 *
 * Augments the backend route with `?id=` from the push payload so the
 * destination page can auto-focus the related entity.
 */
export function navigateToUrl(
    url: string | undefined | null,
    userRole?: string,
    relatedId?: string | null,
    relatedType?: NotificationRelatedType | null
): void {
    if (typeof window === 'undefined') return;
    if (!url || !url.startsWith('/')) {
        window.dispatchEvent(new CustomEvent('hallofood:navigate', { detail: '/' }));
        return;
    }
    if (userRole && userRole !== 'ADMIN' && url.startsWith('/admin/')) {
        url = '/';
    }
    const deep = notificationToUrl(url, relatedId ?? null, relatedType ?? null);
    try {
        sessionStorage.setItem('pendingNav', deep);
    } catch {
        // best-effort
    }
    window.dispatchEvent(new CustomEvent('hallofood:navigate', { detail: deep }));
}
