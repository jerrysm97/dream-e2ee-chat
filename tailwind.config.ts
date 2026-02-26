import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                zk: {
                    void: '#0D0000',
                    surface: '#130304',
                    deep: '#1A0505',
                    maroon: '#6B1A1A',
                    hot: '#8B2020',
                    crimson: '#C0392B',
                    gold: '#C9A84C',
                    'gold-pale': '#E8D5A3',
                    ivory: '#F5F0E8',
                    ash: '#A89880',
                    ember: '#8B6F47',
                },
            },
            fontFamily: {
                display: ['Cinzel', 'Trajan Pro', 'serif'],
                body: ['Crimson Pro', 'Palatino Linotype', 'Georgia', 'serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
            },
            borderRadius: {
                DEFAULT: '4px',
                sm: '2px',
                none: '0px',
            },
            boxShadow: {
                'zk-glow': '0 0 20px rgba(139, 32, 32, 0.20)',
                'zk-gold': '0 0 8px rgba(201, 168, 76, 0.30)',
                'zk-panel': '0 1px 3px rgba(0,0,0,0.6), 0 0 20px rgba(139,32,32,0.20)',
            },
            animation: {
                'msg-in': 'msgIn 180ms ease forwards',
                'palette-in': 'paletteIn 150ms cubic-bezier(0.2,0,0,1) forwards',
                'gold-pulse': 'goldPulse 2s ease-in-out infinite',
            },
            keyframes: {
                msgIn: {
                    '0%': { opacity: '0', transform: 'translateY(6px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                paletteIn: {
                    '0%': { opacity: '0', transform: 'scale(0.97) translateY(-8px)' },
                    '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
                },
                goldPulse: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.5' },
                },
            },
        },
    },
    plugins: [],
};
export default config;
