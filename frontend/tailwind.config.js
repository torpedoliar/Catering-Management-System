/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#fffbeb',
                    100: '#fef3c7',
                    200: '#fde68a',
                    300: '#fcd34d',
                    400: '#fbbf24',
                    500: '#f59e0b',
                    600: '#d97706',
                    700: '#b45309',
                    800: '#92400e',
                    900: '#78350f',
                    DEFAULT: '#f59e0b',
                },
                accent: {
                    amber: '#f59e0b',
                    teal: '#14b8a6',
                    violet: '#8b5cf6',
                    rose: '#f43f5e',
                    emerald: '#10b981',
                },
                dark: {
                    bg: '#0f172a',
                    'bg-secondary': '#1e293b',
                    'bg-tertiary': '#f5f5f4',
                    'bg-elevated': '#334155',
                    card: '#ffffff',
                    'card-secondary': '#f5f5f4',
                    lighter: '#f5f5f4',
                    light: '#fafaf9',
                },
                success: '#22c55e',
                danger: '#ef4444',
                warning: '#f59e0b',
                info: '#3b82f6',
            },
            fontFamily: {
                sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
            borderRadius: {
                'xl': '14px',
                '2xl': '18px',
                '3xl': '24px',
            },
            boxShadow: {
                'glow': '0 0 40px rgba(245, 158, 11, 0.2)',
                'glow-success': '0 0 40px rgba(34, 197, 94, 0.3)',
                'glow-danger': '0 0 40px rgba(239, 68, 68, 0.3)',
                'card': '0 4px 24px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04)',
                'card-hover': '0 8px 40px rgba(28, 25, 23, 0.08), 0 0 0 1px rgba(245, 158, 11, 0.05)',
            },
            backgroundImage: {
                'gradient-primary': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                'gradient-success': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                'gradient-danger': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                'gradient-warning': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                'gradient-info': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                'gradient-dark': 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                'gradient-card': 'linear-gradient(145deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 250, 249, 0.95) 100%)',
            },
            animation: {
                'fade-in': 'fadeIn 0.4s ease-out',
                'slide-up': 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                'scale-in': 'scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                'glow': 'glow 2s ease-in-out infinite alternate',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(30px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                scaleIn: {
                    '0%': { transform: 'scale(0.9)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                glow: {
                    '0%': { boxShadow: '0 0 20px rgba(245, 158, 11, 0.15)' },
                    '100%': { boxShadow: '0 0 40px rgba(245, 158, 11, 0.25)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
            },
        },
    },
    plugins: [],
}
