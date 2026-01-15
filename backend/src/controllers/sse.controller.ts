import { Response } from 'express';
import { getNow } from '../services/time.service';

interface SSEClient {
    id: string;
    tabId: string;
    userId?: string;
    role?: string;
    response: Response;
    connectedAt: Date;
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

    addClient(id: string, tabId: string, response: Response, userId?: string, role?: string): void {
        // Set SSE headers
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Connection', 'keep-alive');
        response.setHeader('X-Accel-Buffering', 'no');
        response.setHeader('Access-Control-Allow-Origin', '*');
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

        this.clients.set(id, {
            id,
            tabId,
            userId,
            role,
            response,
            connectedAt: getNow()
        });

        console.log(`📡 SSE Client connected: ${id} | Tab: ${tabId} | User: ${userId} | Role: ${role} (Total: ${this.clients.size})`);

        // Broadcast client count update to all
        this.broadcastClientCount();
    }

    removeClient(id: string): void {
        const client = this.clients.get(id);
        if (client) {
            console.log(`📡 SSE Client disconnected: ${id} | Tab: ${client.tabId} (Total: ${this.clients.size - 1})`);
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

    // Broadcast to ALL connected clients (all windows, all tabs)
    broadcast(event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                broadcastTime: getNow().toISOString(),
                clientCount: this.clients.size,
            }
        };

        const message = `event: ${event}\ndata: ${JSON.stringify(enrichedData)}\n\n`;

        this.logEvent(event, enrichedData);

        let successCount = 0;
        let failCount = 0;

        this.clients.forEach((client) => {
            try {
                client.response.write(message);
                successCount++;
            } catch (error) {
                console.error(`Failed to send to client ${client.id}:`, error);
                this.removeClient(client.id);
                failCount++;
            }
        });

        console.log(`📡 Broadcast [${event}] to ${successCount} clients (${failCount} failed)`);
    }

    // Broadcast to specific user (all their windows/tabs)
    broadcastToUser(userId: string, event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                targetUser: userId,
                broadcastTime: getNow().toISOString(),
            }
        };

        const message = `event: ${event}\ndata: ${JSON.stringify(enrichedData)}\n\n`;

        let count = 0;
        this.clients.forEach((client) => {
            if (client.userId === userId) {
                try {
                    client.response.write(message);
                    count++;
                } catch (error) {
                    this.removeClient(client.id);
                }
            }
        });

        console.log(`📡 Broadcast [${event}] to user ${userId} (${count} tabs)`);
    }

    // Broadcast to specific roles (ADMIN, CANTEEN) - all their windows/tabs
    broadcastToRoles(roles: string[], event: string, data: any): void {
        const enrichedData = {
            ...data,
            _sse: {
                event,
                targetRoles: roles,
                broadcastTime: getNow().toISOString(),
            }
        };

        const message = `event: ${event}\ndata: ${JSON.stringify(enrichedData)}\n\n`;

        let count = 0;
        this.clients.forEach((client) => {
            if (client.role && roles.includes(client.role)) {
                try {
                    client.response.write(message);
                    count++;
                } catch (error) {
                    this.removeClient(client.id);
                }
            }
        });

        console.log(`📡 Broadcast [${event}] to roles [${roles.join(', ')}] (${count} clients)`);
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

        const message = `event: ${event}\ndata: ${JSON.stringify(enrichedData)}\n\n`;

        this.clients.forEach((client) => {
            if (client.userId !== userId) {
                try {
                    client.response.write(message);
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
}

export const sseManager = new SSEManager();
