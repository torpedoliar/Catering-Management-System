import { Response } from 'express';
import { createClient, RedisClientType } from 'redis';
import { getNow } from '../services/time.service';

interface SSEClient {
    id: string;
    tabId: string;
    userId?: string;
    role?: string;
    response: Response;
    connectedAt: Date;
    lastActivity: Date; // FIX-H1: idle timeout tracking
}

interface EventLog {
    event: string;
    data: any;
    timestamp: Date;
}

class SSEManager {
    private clients: Map<string, SSEClient> = new Map();
    private eventHistory: EventLog[] = [];
    private maxHistorySize = 100;

    // FIX-H1: Redis pub/sub for cluster awareness
    private pubClient: RedisClientType | null = null;
    private subClient: RedisClientType | null = null;
    private readonly MAX_CLIENTS = 1000;
    private readonly MAX_CLIENTS_PER_USER = 5;
    private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

    // FIX-H1: Initialize Redis pub/sub — call once at startup
    async initPubSub(): Promise<void> {
        const redisUrl = process.env.REDIS_URL || 'redis://catering-redis:6379';

        try {
            this.pubClient = createClient({
                url: redisUrl,
                socket: {
                    reconnectStrategy: (retries: number) => {
                        if (retries > 10) return new Error('SSE pub max retries');
                        return Math.min(retries * 100, 3000);
                    }
                }
            }) as RedisClientType;

            this.subClient = this.pubClient.duplicate() as RedisClientType;

            this.pubClient.on('error', (err) => console.error('[SSE-PUB] Error:', err));
            this.subClient.on('error', (err) => console.error('[SSE-SUB] Error:', err));

            await this.pubClient.connect();
            await this.subClient.connect();

            // Subscribe to broadcast channel
            await this.subClient.subscribe('sse:broadcast', (message) => {
                try {
                    const { event, data } = JSON.parse(message);
                    this.writeToLocalClients(event, data, null);
                } catch (e) {
                    console.error('[SSE-SUB] broadcast parse error:', e);
                }
            });

            // Subscribe to user-specific channels
            await this.subClient.pSubscribe('sse:user:*', (message, channel) => {
                try {
                    const userId = channel.replace('sse:user:', '');
                    const { event, data } = JSON.parse(message);
                    this.writeToLocalClients(event, data, { userId });
                } catch (e) {
                    console.error('[SSE-SUB] user parse error:', e);
                }
            });

            // Subscribe to role-specific channels
            await this.subClient.pSubscribe('sse:roles:*', (message, channel) => {
                try {
                    const role = channel.replace('sse:roles:', '');
                    const { event, data } = JSON.parse(message);
                    this.writeToLocalClients(event, data, { role });
                } catch (e) {
                    console.error('[SSE-SUB] roles parse error:', e);
                }
            });

            console.log('[SSE] Redis pub/sub initialized for cluster awareness');
        } catch (error) {
            console.error('[SSE] Redis pub/sub init failed, falling back to local-only:', error);
            this.pubClient = null;
            this.subClient = null;
        }

        // FIX-H1: Start idle timeout checker (every 60s)
        this.idleCheckTimer = setInterval(() => this.closeIdleClients(), 60000);
    }

    // FIX-H1: Close idle connections (no activity for 5 minutes)
    private closeIdleClients(): void {
        const now = getNow();
        for (const [id, client] of this.clients) {
            if (now.getTime() - client.lastActivity.getTime() > this.IDLE_TIMEOUT_MS) {
                try {
                    client.response.write(`event: disconnect\ndata: {"reason":"idle_timeout"}\n\n`);
                    client.response.end();
                } catch {
                    // Best-effort
                }
                this.removeClient(id);
            }
        }
    }

    // FIX-H1: Write to local clients only (called by Redis sub handler)
    private writeToLocalClients(event: string, data: any, filter: { userId?: string; role?: string } | null): void {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        this.clients.forEach((client) => {
            if (filter?.userId && client.userId !== filter.userId) return;
            if (filter?.role && client.role !== filter.role) return;
            try {
                client.response.write(message);
                client.lastActivity = getNow();
            } catch {
                this.removeClient(client.id);
            }
        });
    }

    addClient(id: string, tabId: string, response: Response, userId?: string, role?: string): void {
        // FIX-H1: Connection cap
        if (this.clients.size >= this.MAX_CLIENTS) {
            response.status(429).json({ error: 'SSE connection limit reached' });
            response.end();
            return;
        }

        // FIX-H1: Per-user cap
        if (userId) {
            let userCount = 0;
            for (const client of this.clients.values()) {
                if (client.userId === userId) userCount++;
            }
            if (userCount >= this.MAX_CLIENTS_PER_USER) {
                response.status(429).json({ error: 'Too many tabs open' });
                response.end();
                return;
            }
        }

        // Set SSE headers
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');
        // R-002: Removed hardcoded Access-Control-Allow-Origin: * — CORS is handled by Express middleware
        response.flushHeaders();

        // Send 4KB padding to flush proxy buffers (Nginx, CloudFlare, etc.)
        // This forces immediate connection establishment without buffering delay
        const padding = ':' + ' '.repeat(4096) + '\n\n';
        response.write(padding);

        // Send initial connection message with client info
        const connectionData = {
            type: 'connected',
            clientId: id,
            tabId,
            userId,
            role,
            connectedClients: this.clients.size + 1,
            timestamp: getNow().toISOString(),
        };
        response.write(`event: connection\ndata: ${JSON.stringify(connectionData)}\n\n`);

        const now = getNow();
        this.clients.set(id, {
            id,
            tabId,
            userId,
            role,
            response,
            connectedAt: now,
            lastActivity: now,
        });

        // Broadcast client count update to all
        this.broadcastClientCount();
    }

    removeClient(id: string): void {
        const client = this.clients.get(id);
        if (client) {
            this.clients.delete(id);
            // Broadcast updated client count
            this.broadcastClientCount();
        }
    }

    private broadcastClientCount(): void {
        const message = `event: clients\ndata: ${JSON.stringify({
            count: this.clients.size,
            timestamp: getNow().toISOString()
        })}\n\n`;

        this.clients.forEach((client) => {
            try {
                client.response.write(message);
            } catch (error) {
                // Client disconnected
            }
        });
    }

    // Log event for history
    private logEvent(event: string, data: any): void {
        this.eventHistory.push({
            event,
            data,
            timestamp: getNow(),
        });

        // Trim history if too large
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }

    // FIX-H1: Publish to Redis instead of direct write
    broadcast(event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                broadcastTime: getNow().toISOString(),
                clientCount: this.clients.size,
            }
        };

        this.logEvent(event, enrichedData);

        if (this.pubClient?.isReady) {
            this.pubClient.publish('sse:broadcast', JSON.stringify({ event, data: enrichedData })).catch(err =>
                console.error(`[SSE] Publish broadcast error:`, err)
            );
        } else {
            // Fallback: direct write (single-process mode or Redis down)
            this.writeToLocalClients(event, enrichedData, null);
        }
    }

    // FIX-H1: Publish to Redis for user-specific
    broadcastToUser(userId: string, event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                targetUser: userId,
                broadcastTime: getNow().toISOString(),
            }
        };

        if (this.pubClient?.isReady) {
            this.pubClient.publish(`sse:user:${userId}`, JSON.stringify({ event, data: enrichedData })).catch(err =>
                console.error(`[SSE] Publish user error:`, err)
            );
        } else {
            this.writeToLocalClients(event, enrichedData, { userId });
        }
    }

    // FIX-H1: Publish to Redis for role-specific
    broadcastToRoles(roles: string[], event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                targetRoles: roles,
                broadcastTime: getNow().toISOString(),
            }
        };

        if (this.pubClient?.isReady) {
            for (const role of roles) {
                this.pubClient.publish(`sse:roles:${role}`, JSON.stringify({ event, data: enrichedData })).catch(err =>
                    console.error(`[SSE] Publish role error:`, err)
                );
            }
        } else {
            this.writeToLocalClients(event, enrichedData, { role: roles[0] });
        }
    }

    // Broadcast to all EXCEPT specific user (for avoiding echo)
    broadcastExceptUser(userId: string, event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                excludeUser: userId,
                broadcastTime: getNow().toISOString(),
            }
        };

        // This method is always local-only (no Redis relay needed)
        // since it's used for echo prevention on the originating worker
        const message = `event: ${event}\ndata: ${JSON.stringify(enrichedData)}\n\n`;

        this.clients.forEach((client) => {
            if (client.userId !== userId) {
                try {
                    client.response.write(message);
                    client.lastActivity = getNow();
                } catch (error) {
                    this.removeClient(client.id);
                }
            }
        });
    }

    getClientCount(): number {
        return this.clients.size;
    }

    getClientsByUser(userId: string): SSEClient[] {
        return Array.from(this.clients.values()).filter(c => c.userId === userId);
    }

    getClientsByRole(role: string): SSEClient[] {
        return Array.from(this.clients.values()).filter(c => c.role === role);
    }

    getStatus(): object {
        const clientsByRole: Record<string, number> = {};
        const clientsByUser: Record<string, number> = {};

        this.clients.forEach((client) => {
            if (client.role) {
                clientsByRole[client.role] = (clientsByRole[client.role] || 0) + 1;
            }
            if (client.userId) {
                clientsByUser[client.userId] = (clientsByUser[client.userId] || 0) + 1;
            }
        });

        return {
            totalConnections: this.clients.size,
            clientsByRole,
            uniqueUsers: Object.keys(clientsByUser).length,
            recentEvents: this.eventHistory.slice(-10).map(e => ({
                event: e.event,
                timestamp: e.timestamp.toISOString(),
            })),
        };
    }

    /**
     * I-2 (Wave 2): close all SSE clients gracefully. Sends a final
     * disconnect event so client-side handlers can distinguish a clean
     * server shutdown from a network failure. The client will then
     * attempt to reconnect — by the time the reconnect timer fires,
     * the process is exiting and the OS will reject the connection.
     */
    closeAllClients(): void {
        const count = this.clients.size;
        for (const [id, client] of this.clients) {
            try {
                client.response.write(`event: disconnect\ndata: {"reason":"server_shutdown"}\n\n`);
                client.response.end();
            } catch {
                // Best-effort; some clients may already be closed.
            }
            this.removeClient(id);
        }
        console.log(`[SSE] closeAllClients: closed ${count} clients`);
    }

    // FIX-H1: Disconnect Redis pub/sub and idle timer on shutdown
    async disconnect(): Promise<void> {
        if (this.idleCheckTimer) {
            clearInterval(this.idleCheckTimer);
            this.idleCheckTimer = null;
        }
        try { await this.subClient?.quit(); } catch { /* ignore */ }
        try { await this.pubClient?.quit(); } catch { /* ignore */ }
        this.pubClient = null;
        this.subClient = null;
        console.log('[SSE] Redis pub/sub disconnected');
    }
}

export const sseManager = new SSEManager();
