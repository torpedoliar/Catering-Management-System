/**
 * PM2 Ecosystem Configuration File
 * 
 * PM2 (Process Manager 2) adalah process manager untuk Node.js yang menyediakan:
 * 1. Cluster Mode - Menjalankan multiple instances untuk memanfaatkan semua CPU cores
 * 2. Auto-restart - Restart otomatis jika aplikasi crash
 * 3. Load Balancing - Distribusi request ke semua instances
 * 4. Zero-downtime Reload - Update tanpa downtime
 * 5. Log Management - Centralized logging
 */

module.exports = {
    apps: [{
        name: 'catering-backend',

        // Use ts-node as interpreter for TypeScript
        script: 'src/index.ts',
        interpreter: './node_modules/.bin/ts-node',
        interpreter_args: '--transpile-only',

        // Cluster mode: use multiple CPU cores
        // Note: cluster mode with ts-node can be problematic
        // Use fork mode for development with TypeScript
        instances: 1,
        exec_mode: 'fork',

        // Memory management
        max_memory_restart: '500M',

        // Watch mode (for development)
        watch: ['src'],
        ignore_watch: ['node_modules', 'logs', '*.log', 'uploads', 'dist'],
        watch_delay: 1000,

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
    }]
};
