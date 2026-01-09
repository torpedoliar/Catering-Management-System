module.exports = {
    apps: [{
        name: 'catering-backend',
        script: 'dist/index.js',
        instances: process.env.PM2_INSTANCES || 'max',
        exec_mode: 'cluster',
        max_memory_restart: '500M',
        watch: false,
        autorestart: true,

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

        // Graceful restart
        kill_timeout: 5000,
        listen_timeout: 10000,

        // Cluster settings
        instance_var: 'INSTANCE_ID',
    }]
};
