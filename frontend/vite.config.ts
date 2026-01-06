import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 3011,
        allowedHosts: true,
        watch: {
            usePolling: true,
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // Core React vendor chunk
                    vendor: ['react', 'react-dom', 'react-router-dom'],
                    // UI libraries
                    ui: ['lucide-react', 'react-hot-toast'],
                    // Utility libraries
                    utils: ['date-fns', 'axios', 'qrcode.react'],
                },
            },
        },
        // Enable minification
        minify: 'esbuild',
        // Smaller chunks warning threshold
        chunkSizeWarningLimit: 500,
    },
})

