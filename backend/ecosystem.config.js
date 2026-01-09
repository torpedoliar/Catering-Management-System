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

        // Cluster mode: gunakan semua CPU cores
        instances: process.env.PM2_INSTANCES || 'max',
        exec_mode: 'cluster',

        // Memory management
        max_memory_restart: '500M',

        // Watch disabled untuk production
        watch: false,

        // Auto-restart configuration
        autorestart: true,
        restart_delay: 1000,
        max_restarts: 10,

        // Environment variables
        env: {
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
