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
 * PENTING: PM2 Cluster mode memerlukan compiled JavaScript!
 * Jalankan `npm run build` terlebih dahulu sebelum menggunakan PM2.
 * 
 * Penggunaan Production:
 * 1. npm run build          # Compile TypeScript ke dist/
 * 2. npm run pm2:start      # Start dengan PM2 cluster mode
 * 
 * Commands:
 * - Status:   npx pm2 status
 * - Logs:     npx pm2 logs
 * - Restart:  npx pm2 restart catering-backend
 * - Stop:     npx pm2 stop catering-backend
 */

module.exports = {
    apps: [{
        name: 'catering-backend',

        // Production: gunakan compiled JavaScript
        script: 'dist/index.js',

        // Cluster mode: 2 workers (optimal untuk 8GB RAM, overridable via PM2_INSTANCES env)
        instances: parseInt(process.env.PM2_INSTANCES, 10) || 2,
        exec_mode: 'cluster',

        // V8 heap tuning — cap at 768MB per worker (leave room for non-heap memory)
        node_args: '--max-old-space-size=768 --max-semi-space-size=64',

        // Memory management
        max_memory_restart: '1G',

        // Watch disabled untuk production
        watch: false,

        // Auto-restart with exponential backoff (100ms → 200ms → 400ms → ... → 15s)
        autorestart: true,
        exp_backoff_restart_delay: 100,
        max_restarts: 10,

        // Environment variables
        // TZ untuk PM2 log timestamps. Runtime TZ di-override ke UTC oleh index.ts (Fake UTC pattern)
        // Aplikasi handle GMT+7 via time.service.ts getNow() bukan via system TZ
        env: {
            NODE_ENV: 'production',
            PORT: 3012,
            TZ: 'Asia/Jakarta',
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
