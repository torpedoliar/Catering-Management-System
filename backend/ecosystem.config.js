/**
 * PM2 Ecosystem Configuration File
 * 
 * PM2 (Process Manager 2) adalah process manager untuk Node.js yang menyediakan:
 * 1. Cluster Mode - Menjalankan multiple instances untuk memanfaatkan semua CPU cores
 * 2. Auto-restart - Restart otomatis jika aplikasi crash
 * 3. Load Balancing - Distribusi request ke semua instances
 * 4. Zero-downtime Reload - Update tanpa downtime
 * 5. Log Management - Centralized logging
 * 
 * Penggunaan:
 * - Development: npm run pm2:dev
 * - Production:  npm run pm2:start
 * - Status:      npx pm2 status
 * - Logs:        npx pm2 logs
 * - Restart:     npx pm2 restart catering-backend
 * - Stop:        npx pm2 stop catering-backend
 */

module.exports = {
    apps: [{
        name: 'catering-backend',

        // Development mode: gunakan ts-node untuk TypeScript
        script: 'node_modules/.bin/ts-node',
        args: 'src/index.ts',

        // Cluster mode: gunakan semua CPU cores
        // Nilai 'max' = jumlah CPU cores yang tersedia
        // Untuk development/testing, bisa set ke angka spesifik (misal: 2)
        instances: process.env.PM2_INSTANCES || 2, // Default 2 untuk development
        exec_mode: 'cluster',

        // Memory management
        max_memory_restart: '500M',

        // Watch mode (untuk development)
        watch: process.env.NODE_ENV !== 'production',
        ignore_watch: ['node_modules', 'logs', '*.log', 'uploads'],

        // Auto-restart configuration
        autorestart: true,
        restart_delay: 1000,
        max_restarts: 10,

        // Environment variables
        env: {
            NODE_ENV: 'development',
            PORT: 3012
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3012
        },

        // Logging
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        merge_logs: true,

        // Graceful shutdown
        kill_timeout: 5000,
        listen_timeout: 10000,

        // Instance identification
        instance_var: 'INSTANCE_ID',
    }]
};
