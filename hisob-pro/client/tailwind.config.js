/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { 950: '#07070c', 900: '#0b0b12', 850: '#10101a', 800: '#151522', 700: '#1d1d2e', 600: '#2a2a40' },
        brand: {
          50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa',
          500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.25), 0 8px 30px -8px rgba(139,92,246,.45)',
        card: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px -12px rgba(0,0,0,.12)',
      },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'scale-in': { from: { opacity: 0, transform: 'scale(.96)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'fade-in': 'fade-in .2s ease-out both',
        'scale-in': 'scale-in .18s ease-out both',
        'slide-in': 'slide-in .25s ease-out both',
      },
    },
  },
  plugins: [],
};
