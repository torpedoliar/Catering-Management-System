import { createClient } from 'redis';

class RedisService {
    private client: ReturnType<typeof createClient> | null = null;
    private isConnected = false;

    async connect() {
        if (this.isConnected && this.client) {
            return this.client;
        }

        try {
            this.client = createClient({
                url: process.env.REDIS_URL || 'redis://catering-redis:6379',
                socket: {
                    reconnectStrategy: (retries: number) => {
                        if (retries > 10) {
                            console.error('[Redis] Max reconnection attempts reached');
                            return new Error('Max reconnection attempts');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            });

            this.client.on('error', (err: Error) => {
                console.error('[Redis] Error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('[Redis] Connecting...');
            });

            this.client.on('ready', () => {
                console.log('[Redis] Ready');
                this.isConnected = true;
            });

            this.client.on('reconnecting', () => {
                console.log('[Redis] Reconnecting...');
                this.isConnected = false;
            });

            await this.client.connect();
            return this.client;
        } catch (error) {
            console.error('[Redis] Connection failed:', error);
            this.isConnected = false;
            return null;
        }
    }

    getClient() {
        return this.client;
    }

    isReady() {
        return this.isConnected && this.client !== null;
    }

    async disconnect() {
        if (this.client) {
            await this.client.quit();
            this.isConnected = false;
            this.client = null;
        }
    }
}

// Singleton instance
export const redisService = new RedisService();
