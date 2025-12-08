import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3012';

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
    'user:blacklisted',
    'user:unblocked',
    'user:strikes-reset',
    'settings:updated',
    'shift:updated',
    'holiday:updated',
    'data:refresh',
];

export function SSEProvider({ children }: { children: ReactNode }) {
    const { user, token } = useAuth();
    const [isConnected, setIsConnected] = useState(false);
    const [connectedClients, setConnectedClients] = useState(0);
    const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);

    // Use ref for subscribers to avoid stale closures
    const subscribersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const isConnectingRef = useRef(false);

    const maxReconnectAttempts = 5;
    const baseReconnectDelayMs = 3000;

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

    const cleanup = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        isConnectingRef.current = false;
    }, []);

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

        const connect = () => {
            // Prevent multiple connect calls
            if (isConnectingRef.current) {
                return;
            }

            isConnectingRef.current = true;

            const url = `${API_URL}/api/sse?userId=${user.id}&role=${user.role}&tabId=${TAB_ID}`;
            console.log(`📡 SSE Connecting... (Tab: ${TAB_ID})`);

            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;
                isConnectingRef.current = false;
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

                // Close the current connection
                eventSource.close();
                eventSourceRef.current = null;

                // Only reconnect if we haven't exceeded max attempts
                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    reconnectAttemptsRef.current++;
                    const delay = baseReconnectDelayMs * reconnectAttemptsRef.current;
                    console.log(`📡 SSE Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (token && user) {
                            connect();
                        }
                    }, delay);
                } else {
                    console.error('📡 SSE Max reconnect attempts reached');
                }
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
                        showEventToast(eventType, data, user.id);
                    } catch (e) {
                        console.error(`Failed to parse SSE event ${eventType}:`, e);
                    }
                });
            });

            // Heartbeat - just confirm connection is alive
            eventSource.addEventListener('heartbeat', () => {
                // Connection is alive, reset reconnect attempts
                reconnectAttemptsRef.current = 0;
            });
        };

        // Small delay before connecting to ensure auth is stable
        const initTimeout = setTimeout(connect, 500);

        return () => {
            clearTimeout(initTimeout);
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

    switch (eventType) {
        case 'order:created':
            if (!isOwnAction) {
                toast.success(`📦 New order: ${data.order?.user?.name || 'User'}`, { icon: '🍽️' });
            }
            break;
        case 'order:checkin':
            toast.success(`✅ ${data.order?.user?.name || 'User'} checked in!`, { icon: '🎉' });
            break;
        case 'order:cancelled':
            if (!isOwnAction) {
                toast(`Order cancelled: ${data.order?.user?.name || 'User'}`, { icon: '❌' });
            }
            break;
        case 'order:noshow':
            toast.error(`No-show: ${data.userName || 'User'}`, { icon: '⚠️' });
            break;
        case 'user:blacklisted':
            toast.error(`${data.userName || 'User'} blacklisted`, { icon: '🚫' });
            break;
        case 'user:unblocked':
            toast.success(`${data.userName || 'User'} unblocked`, { icon: '✅' });
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

// Custom hook for auto-refresh on SSE events
export function useSSERefresh(eventTypes: string[], refreshFn: () => void) {
    const { subscribe, subscribeMultiple } = useSSE();

    useEffect(() => {
        const unsubscribe = eventTypes.length === 1
            ? subscribe(eventTypes[0], refreshFn)
            : subscribeMultiple(eventTypes, refreshFn);

        return unsubscribe;
    }, [eventTypes, refreshFn, subscribe, subscribeMultiple]);
}

// Get all order-related events
export const ORDER_EVENTS = ['order:created', 'order:checkin', 'order:cancelled', 'order:noshow'];
export const USER_EVENTS = ['user:blacklisted', 'user:unblocked', 'user:strikes-reset'];
export const SETTINGS_EVENTS = ['settings:updated'];
export const SHIFT_EVENTS = ['shift:updated'];
export const HOLIDAY_EVENTS = ['holiday:updated'];
export const ALL_DATA_EVENTS = [...ORDER_EVENTS, ...USER_EVENTS, ...SETTINGS_EVENTS, ...SHIFT_EVENTS, ...HOLIDAY_EVENTS, 'data:refresh'];
