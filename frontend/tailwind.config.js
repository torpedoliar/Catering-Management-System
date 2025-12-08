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
                    50: '#f0f5ff',
                    100: '#e0e7ff',
                    200: '#c7d2fe',
                    300: '#a5b4fc',
                    400: '#818cf8',
                    500: '#667eea',
                    600: '#5a67d8',
                    700: '#4c51bf',
                    800: '#434190',
                    900: '#3730a3',
                },
                accent: {
                    purple: '#764ba2',
                    pink: '#f093fb',
                    cyan: '#00f2fe',
                    teal: '#38ef7d',
                },
                dark: {
                    bg: '#0c0c0c',
                    'bg-secondary': '#1a1a2e',
                    'bg-tertiary': '#16213e',
                    'bg-elevated': '#1e1e3f',
                    card: '#1e1e32',
                },
                success: '#38ef7d',
                danger: '#eb3349',
                warning: '#fbbf24',
                info: '#4facfe',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
            borderRadius: {
                'xl': '14px',
                '2xl': '18px',
                '3xl': '24px',
            },
            boxShadow: {
                'glow': '0 0 40px rgba(102, 126, 234, 0.4)',
                'glow-success': '0 0 40px rgba(56, 239, 125, 0.4)',
                'glow-danger': '0 0 40px rgba(235, 51, 73, 0.4)',
                'card': '0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                'card-hover': '0 8px 40px rgba(0, 0, 0, 0.4), 0 0 60px rgba(102, 126, 234, 0.1)',
            },
            backgroundImage: {
                'gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                'gradient-success': 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                'gradient-danger': 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)',
                'gradient-warning': 'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
                'gradient-info': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                'gradient-dark': 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%)',
                'gradient-card': 'linear-gradient(145deg, rgba(30, 30, 50, 0.95) 0%, rgba(20, 20, 40, 0.95) 100%)',
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
                    '0%': { boxShadow: '0 0 20px rgba(102, 126, 234, 0.4)' },
                    '100%': { boxShadow: '0 0 40px rgba(102, 126, 234, 0.6)' },
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
