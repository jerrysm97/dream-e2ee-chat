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
                neon: {
                    green: "#25D366",
                    blue: "#00d2ff",
                    purple: "#9d50bb",
                },
                portal: {
                    bg: "#050a14",
                },
            },
            backgroundImage: {
                'portal-gradient': 'radial-gradient(circle at top right, #0a1f1a, #050a14)',
            },
            animation: {
                'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in-slide': 'fadeInSlide 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
                'pulse-border': 'pulseBorder 2s ease-in-out infinite',
            },
            keyframes: {
                fadeInSlide: {
                    '0%': { opacity: '0', transform: 'translateY(15px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                pulseBorder: {
                    '0%, 100%': { boxShadow: '0 0 0 0 rgba(37, 211, 102, 0.7)' },
                    '50%': { boxShadow: '0 0 0 10px rgba(37, 211, 102, 0)' },
                }
            }
        },
    },
    plugins: [],
};
export default config;
