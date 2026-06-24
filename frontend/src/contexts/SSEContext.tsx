import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';

const API_URL = import.meta.env.VITE_API_URL || '';

// Generate unique tab ID for this browser tab
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface SSEEvent {
    type: string;
    data: any;
    timestamp: string;
}

type EventCallback = (data: any) => void;

interface SSEContextType {
    isConnected: boolean;
    connectedClients: number;
    lastEvent: SSEEvent | null;
    tabId: string;
    subscribe: (eventType: string, callback: EventCallback) => () => void;
    subscribeMultiple: (eventTypes: string[], callback: EventCallback) => () => void;
}

const SSEContext = createContext<SSEContextType | undefined>(undefined);

// All supported events
const ALL_EVENTS = [
    'order:created',
    'order:checkin',
    'order:cancelled',
    'order:noshow',
    'order:bulk_created',
    'user:blacklisted',
    'user:unblocked',
    'user:strikes-reset',
    'settings:updated',
    'shift:updated',
    'holiday:updated',
    'canteen:created',
    'canteen:updated',
    'canteen:deleted',
    'announcement:created',
    'announcement:updated',
    'announcement:deleted',
    'vendor:created',
    'vendor:updated',
    'vendor:deleted',
    'menu:created',
    'menu:updated',
    'menu:deleted',
    'weekly-menu:updated',
    'data:refresh',
    'notification:new',
];

export function SSEProvider({ children }: { children: ReactNode }) {
    const { user, token } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const [connectedClients, setConnectedClients] = useState(0);
    const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);

    // Use ref for subscribers to avoid stale closures
    const subscribersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const isConnectingRef = useRef(false);
    const lastHeartbeatRef = useRef<number>(Date.now());
    const heartbeatWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const connectionProbeRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Infinite reconnect with capped exponential backoff (never gives up)
    const maxBackoffMs = 30_000;        // Cap delay at 30s
    const baseReconnectDelayMs = 1000;  // Start at 1s
    // Server sends heartbeat every 10s. If none in 25s → connection is dead.
    const heartbeatTimeoutMs = 25_000;
    // Probe EventSource readyState every 15s to catch silent zombie connections
    const probeIntervalMs = 15_000;

    /**
     * Compute delay for attempt N with capped exponential backoff + jitter.
     * attempt 1→1s, 2→2s, 3→4s, 4→8s, 5→16s, 6+→30s (capped)
     */
    const getReconnectDelay = useCallback((attempt: number): number => {
        const exponential = baseReconnectDelayMs * Math.pow(2, attempt - 1);
        const capped = Math.min(exponential, maxBackoffMs);
        // Add ±20% jitter to avoid thundering-herd on server restart
        const jitter = capped * 0.2 * (Math.random() * 2 - 1);
        return Math.max(500, capped + jitter);
    }, []);

    const notifySubscribers = useCallback((eventType: string, data: any) => {
        const callbacks = subscribersRef.current.get(eventType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`SSE callback error for ${eventType}:`, error);
                }
            });
        }

        // Also notify wildcard subscribers
        const wildcardCallbacks = subscribersRef.current.get('*');
        if (wildcardCallbacks) {
            wildcardCallbacks.forEach(callback => {
                try {
                    callback({ type: eventType, data });
                } catch (error) {
                    console.error('SSE wildcard callback error:', error);
                }
            });
        }
    }, []);

    /**
     * Stop the heartbeat watchdog and connection probe timers.
     */
    const stopWatchdogs = useCallback(() => {
        if (heartbeatWatchdogRef.current) {
            clearInterval(heartbeatWatchdogRef.current);
            heartbeatWatchdogRef.current = null;
        }
        if (connectionProbeRef.current) {
            clearInterval(connectionProbeRef.current);
            connectionProbeRef.current = null;
        }
    }, []);

    /**
     * Start the heartbeat watchdog: if no heartbeat arrives within
     * `heartbeatTimeoutMs`, the connection is silently dead → force reconnect.
     * Also start the connection probe that checks EventSource.readyState.
     */
    const startWatchdogs = useCallback(() => {
        stopWatchdogs();
        lastHeartbeatRef.current = Date.now();

        // Heartbeat watchdog — detect silent connection death
        heartbeatWatchdogRef.current = setInterval(() => {
            const elapsed = Date.now() - lastHeartbeatRef.current;
            if (elapsed > heartbeatTimeoutMs) {
                console.log(`📡 Heartbeat watchdog: no heartbeat for ${Math.round(elapsed / 1000)}s — forcing reconnect`);
                const es = eventSourceRef.current;
                if (es) {
                    es.close();
                    eventSourceRef.current = null;
                }
                isConnectingRef.current = false;
                setIsConnected(false);
                // Reset attempts so reconnect starts with short delay
                reconnectAttemptsRef.current = Math.min(reconnectAttemptsRef.current, 2);
                connectRef.current();
            }
        }, 5_000); // Check every 5s

        // Connection probe — catch zombie EventSource (readyState != OPEN)
        connectionProbeRef.current = setInterval(() => {
            const es = eventSourceRef.current;
            if (!es) return;
            if (es.readyState === EventSource.CLOSED) {
                console.log('📡 Connection probe: EventSource is CLOSED — forcing reconnect');
                es.close();
                eventSourceRef.current = null;
                isConnectingRef.current = false;
                setIsConnected(false);
                reconnectAttemptsRef.current = Math.min(reconnectAttemptsRef.current, 2);
                connectRef.current();
            }
            // CONNECTING (readyState 0) = native auto-reconnect in progress.
            // Don't interfere — EventSource will fire onopen or onerror.
        }, probeIntervalMs);
    }, [stopWatchdogs]);

    /**
     * Schedule a reconnect attempt with capped backoff.
     * Never gives up — keeps retrying indefinitely.
     */
    const scheduleReconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) return; // Already scheduled
        if (!token || !user) return;              // No auth, don't reconnect

        reconnectAttemptsRef.current++;
        const delay = getReconnectDelay(reconnectAttemptsRef.current);
        console.log(`📡 SSE Reconnect scheduled in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current})`);

        reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (token && user) {
                connectRef.current();
            }
        }, delay);
    }, [token, user, getReconnectDelay]);

    const cleanup = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        stopWatchdogs();
        isConnectingRef.current = false;
    }, [stopWatchdogs]);

    // Declare connect as a ref-stable function so scheduleReconnect and
    // watchdogs can call it without being in each other's dependency arrays.
    const connectRef = useRef<() => void>(() => {});

    const connect = useCallback(async () => {
        // Prevent multiple connect calls
        if (isConnectingRef.current) return;
        if (eventSourceRef.current?.readyState === EventSource.OPEN) return;

        isConnectingRef.current = true;

        try {
            // R-002: Obtain SSE ticket via authenticated endpoint
            const ticketRes = await fetch(`${API_URL}/api/sse/ticket`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
            });

            if (!ticketRes.ok) {
                throw new Error(`SSE ticket request failed: ${ticketRes.status}`);
            }

            const { ticket } = await ticketRes.json();

            // R-002: Connect with server-validated ticket instead of raw userId/role
            const url = `${API_URL}/api/sse?ticket=${encodeURIComponent(ticket)}&tabId=${TAB_ID}`;
            console.log(`📡 SSE Connecting... (Tab: ${TAB_ID}, attempt ${reconnectAttemptsRef.current})`);

            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;
        } catch (error) {
            console.error('📡 SSE ticket/connect error:', error);
            isConnectingRef.current = false;

            // FE-2: Close any leaked EventSource that was assigned during the
            // failed ticket/connect path. Without this, the broken EventSource
            // holds a TCP handle and re-fires onerror recursively.
            const leaked = eventSourceRef.current;
            if (leaked) {
                try { leaked.close(); } catch { /* noop */ }
                eventSourceRef.current = null;
            }

            // Infinite retry — never gives up
            scheduleReconnect();
            return;
        }

        const eventSource = eventSourceRef.current!;

        eventSource.onopen = () => {
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            isConnectingRef.current = false;
            lastHeartbeatRef.current = Date.now();
            startWatchdogs();
            console.log(`📡 SSE Connected (Tab: ${TAB_ID})`);
        };

        eventSource.onerror = () => {
            // Only handle if this is still our active connection
            if (eventSourceRef.current !== eventSource) {
                return;
            }

            console.log('📡 SSE Connection error');
            setIsConnected(false);
            isConnectingRef.current = false;
            stopWatchdogs();

            // Close the current connection
            eventSource.close();
            eventSourceRef.current = null;

            // Infinite reconnect — never gives up
            scheduleReconnect();
        };

        // Connection event from server
        eventSource.addEventListener('connection', (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                setConnectedClients(data.connectedClients || 1);
                console.log('📡 SSE Connection confirmed:', data.clientId);
            } catch (e) {
                console.error('Failed to parse connection event:', e);
            }
        });

        // Client count updates
        eventSource.addEventListener('clients', (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                setConnectedClients(data.count || 0);
            } catch (e) {
                // Ignore parse errors
            }
        });

        // Handle all business events
        ALL_EVENTS.forEach(eventType => {
            eventSource.addEventListener(eventType, (event: MessageEvent) => {
                try {
                    const data = JSON.parse(event.data);
                    const eventObj = { type: eventType, data, timestamp: new Date().toISOString() };
                    setLastEvent(eventObj);
                    notifySubscribers(eventType, data);
                    showEventToast(eventType, data, user?.id ?? '');
                } catch (e) {
                    console.error(`Failed to parse SSE event ${eventType}:`, e);
                }
            });
        });

        // Heartbeat — track last heartbeat time so watchdog can detect silence
        eventSource.addEventListener('heartbeat', () => {
            lastHeartbeatRef.current = Date.now();
            // Also reset reconnect attempts on successful heartbeat
            reconnectAttemptsRef.current = 0;
        });
    }, [token, user, notifySubscribers, scheduleReconnect, startWatchdogs, stopWatchdogs]);

    // Keep connectRef in sync so watchdogs/scheduleReconnect always call latest
    connectRef.current = connect;

    useEffect(() => {
        if (!token || !user) {
            cleanup();
            setIsConnected(false);
            return;
        }

        // Prevent multiple simultaneous connections
        if (isConnectingRef.current || eventSourceRef.current?.readyState === EventSource.OPEN) {
            return;
        }

        // Reconnect when tab becomes visible (aggressive reconnect)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // If not connected, try to reconnect immediately
                if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
                    console.log('📡 Tab visible — reconnecting SSE...');
                    reconnectAttemptsRef.current = 0; // Reset to get fast delay
                    cleanup();
                    setTimeout(() => connectRef.current(), 100); // Small delay for stability
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Reconnect on network online
        const handleOnline = () => {
            console.log('📡 Network online — reconnecting SSE...');
            reconnectAttemptsRef.current = 0;
            cleanup();
            setTimeout(() => connectRef.current(), 300);
        };

        window.addEventListener('online', handleOnline);

        // Small delay before connecting to ensure auth is stable
        const initTimeout = setTimeout(() => connectRef.current(), 500);

        return () => {
            clearTimeout(initTimeout);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            cleanup();
            setIsConnected(false);
        };
    }, [token, user?.id, user?.role, notifySubscribers, cleanup]);

    // Subscribe to a single event type
    const subscribe = useCallback((eventType: string, callback: EventCallback): (() => void) => {
        if (!subscribersRef.current.has(eventType)) {
            subscribersRef.current.set(eventType, new Set());
        }
        subscribersRef.current.get(eventType)!.add(callback);

        return () => {
            subscribersRef.current.get(eventType)?.delete(callback);
        };
    }, []);

    // Subscribe to multiple event types with one callback
    const subscribeMultiple = useCallback((eventTypes: string[], callback: EventCallback): (() => void) => {
        eventTypes.forEach(eventType => {
            if (!subscribersRef.current.has(eventType)) {
                subscribersRef.current.set(eventType, new Set());
            }
            subscribersRef.current.get(eventType)!.add(callback);
        });

        return () => {
            eventTypes.forEach(eventType => {
                subscribersRef.current.get(eventType)?.delete(callback);
            });
        };
    }, []);

    return (
        <SSEContext.Provider value={{
            isConnected,
            connectedClients,
            lastEvent,
            tabId: TAB_ID,
            subscribe,
            subscribeMultiple,
        }}>
            {children}
        </SSEContext.Provider>
    );
}

// Show toast notifications for events
function showEventToast(eventType: string, data: any, currentUserId: string) {
    // Don't show toast for own actions
    const isOwnAction = data.order?.userId === currentUserId || data.userId === currentUserId;

    // FE-NOTIF-NAV: every business toast is clickable. The onClick builds
    // a minimal Notification-shaped object from the SSE payload and lets
    // the shared mapper decide the destination route. Ambient activity
    // toasts (order:checkin, order:created) keep the user's flow on the
    // current page by default — they go to `/` or `/history` depending
    // on whether the event carries a related order.
    const goTo = (notif: {
        relatedType?: 'ORDER' | 'BLACKLIST' | 'MESSAGE' | 'NONE' | null;
        relatedId?: string | null;
        title?: string;
    }) => {
        // Lazy import: keeps the SSE context bundle small for users who
        // never tap a toast and avoids a circular dep with AuthContext.
        import('../utils/notificationRoutes').then(({ navigateToNotification }) => {
            navigateToNotification({
                relatedType: notif.relatedType ?? null,
                relatedId: notif.relatedId ?? null,
                title: notif.title ?? '',
            });
        }).catch(() => {});
    };

    // react-hot-toast@2.4.1 does not declare `onClick` on its options type,
    // but the runtime accepts any additional property and wires it through
    // to the underlying toast component. Cast through unknown so we can
    // pass the handler without breaking the type-checked surface.
    const withClick = (opts: Record<string, unknown>) => opts as unknown as Parameters<typeof toast>[1];

    switch (eventType) {
        case 'order:created':
            if (!isOwnAction) {
                toast.success(`📦 New order: ${data.order?.user?.name || 'User'}`, withClick({
                    icon: '🍽️',
                    onClick: () => goTo({ relatedType: 'ORDER', relatedId: data.order?.id, title: 'order:created' }),
                }));
            }
            // Cancel reminders on Android when own order is created
            if (isOwnAction && Capacitor.isNativePlatform()) {
                import('../services/notification-service').then(({ cancelAllReminders }) => {
                    cancelAllReminders();
                }).catch(() => {});
            }
            break;
        case 'order:bulk_created':
            // Cancel reminders when bulk order includes today
            if (isOwnAction && Capacitor.isNativePlatform()) {
                import('../services/notification-service').then(({ cancelAllReminders }) => {
                    cancelAllReminders();
                }).catch(() => {});
            }
            break;
        case 'order:checkin':
            toast.success(`✅ ${data.order?.user?.name || 'User'} checked in!`, withClick({
                icon: '🎉',
                onClick: () => goTo({ relatedType: 'ORDER', relatedId: data.order?.id, title: 'order:checkin' }),
            }));
            break;
        case 'order:cancelled':
            if (!isOwnAction) {
                toast(`Order cancelled: ${data.order?.user?.name || 'User'}`, withClick({
                    icon: '❌',
                    onClick: () => goTo({ relatedType: 'ORDER', relatedId: data.order?.id, title: 'order:cancelled' }),
                }));
            }
            // Reschedule reminders on Android when own order is cancelled
            if (isOwnAction && Capacitor.isNativePlatform()) {
                import('../services/notification-service').then(({ rescheduleRemindersFromAPI }) => {
                    rescheduleRemindersFromAPI();
                }).catch(() => {});
            }
            break;
        case 'order:noshow':
            toast.error(`Tidak diambil: ${data.userName || 'User'}`, withClick({
                icon: '⚠️',
                onClick: () => goTo({ relatedType: 'ORDER', relatedId: data.orderId, title: 'order:noshow' }),
            }));
            break;
        case 'user:blacklisted':
            toast.error(`${data.userName || 'User'} blacklisted`, withClick({
                icon: '🚫',
                onClick: () => goTo({ relatedType: 'BLACKLIST', relatedId: data.blacklistId, title: 'user:blacklisted' }),
            }));
            break;
        case 'user:unblocked':
            toast.success(`${data.userName || 'User'} unblocked`, withClick({
                icon: '✅',
                onClick: () => goTo({ relatedType: 'BLACKLIST', relatedId: data.blacklistId, title: 'user:unblocked' }),
            }));
            break;
        case 'notification:new':
            toast.success(data.notification?.title || 'Notification', withClick({
                icon: '🔔',
                style: { background: '#f8fafc', color: '#334155' },
                // The notification object already carries relatedType /
                // relatedId from the backend payload — use them directly.
                onClick: () => goTo({
                    relatedType: data.notification?.relatedType ?? null,
                    relatedId: data.notification?.relatedId ?? null,
                    title: data.notification?.title ?? '',
                }),
            }));
            break;
    }
}

export function useSSE() {
    const context = useContext(SSEContext);
    if (context === undefined) {
        throw new Error('useSSE must be used within an SSEProvider');
    }
    return context;
}

// Custom hook for auto-refresh on SSE events.
//
// Uses refs for both `eventTypes` and `refreshFn` so that callers can
// safely pass inline arrays (e.g. `[...ORDER_EVENTS, ...USER_EVENTS]`)
// or inline functions without triggering unsubscribe/resubscribe on
// every render.  The effect only re-fires when the *content* of
// `eventTypes` actually changes (compared via a joined string key).
export function useSSERefresh(eventTypes: string[], refreshFn: () => void) {
    const { subscribe, subscribeMultiple } = useSSE();

    // Always call the latest callback without re-running the effect.
    const refreshFnRef = useRef(refreshFn);
    refreshFnRef.current = refreshFn;

    const stableCallback = useCallback(() => {
        refreshFnRef.current();
    }, []);

    // Derive a stable string key from the event list so the effect only
    // re-subscribes when the set of events actually changes.
    const eventKey = eventTypes.join(',');
    const eventKeyRef = useRef(eventKey);
    const eventTypesRef = useRef(eventTypes);
    if (eventKeyRef.current !== eventKey) {
        eventKeyRef.current = eventKey;
        eventTypesRef.current = eventTypes;
    }

    useEffect(() => {
        const types = eventTypesRef.current;
        const unsubscribe = types.length === 1
            ? subscribe(types[0], stableCallback)
            : subscribeMultiple(types, stableCallback);

        return unsubscribe;
    }, [eventKey, stableCallback, subscribe, subscribeMultiple]);
}

// Get all order-related events
export const ORDER_EVENTS = ['order:created', 'order:checkin', 'order:cancelled', 'order:noshow', 'order:bulk_created'];
export const USER_EVENTS = ['user:blacklisted', 'user:unblocked', 'user:strikes-reset'];
export const SETTINGS_EVENTS = ['settings:updated'];
export const SHIFT_EVENTS = ['shift:updated'];
export const HOLIDAY_EVENTS = ['holiday:updated'];
export const CANTEEN_EVENTS = ['canteen:created', 'canteen:updated', 'canteen:deleted'];
export const ANNOUNCEMENT_EVENTS = ['announcement:created', 'announcement:updated', 'announcement:deleted'];
export const VENDOR_EVENTS = ['vendor:created', 'vendor:updated', 'vendor:deleted'];
export const MENU_EVENTS = ['menu:created', 'menu:updated', 'menu:deleted', 'weekly-menu:updated'];
export const ALL_DATA_EVENTS = [...ORDER_EVENTS, ...USER_EVENTS, ...SETTINGS_EVENTS, ...SHIFT_EVENTS, ...HOLIDAY_EVENTS, ...CANTEEN_EVENTS, ...ANNOUNCEMENT_EVENTS, ...VENDOR_EVENTS, ...MENU_EVENTS, 'data:refresh'];
