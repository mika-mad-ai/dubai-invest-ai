/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#f0c040',
          500: '#d4a843',
          600: '#b8891e',
          700: '#926d18',
          800: '#6b4f12',
          900: '#4a360c',
        },
        azure: {
          300: '#7dd3e8',
          400: '#48cae4',
          500: '#0096c7',
          600: '#0077b6',
          700: '#023e8a',
        },
        midnight: {
          800: '#1a1828',
          900: '#0d0c18',
          950: '#050508',
        },
      },
      fontFamily: {
        sans: ['"Manrope"', 'sans-serif'],
        serif: ['"Sora"', 'sans-serif'],
      },
      backgroundImage: {
        'luxury-gradient': 'linear-gradient(to bottom, #060e1a 0%, #0a1828 100%)',
        'gold-gradient': 'linear-gradient(135deg, #fef3c7 0%, #f0c040 50%, #b8891e 100%)',
      },
      boxShadow: {
        glow: '0 0 20px -5px rgba(212,168,67,0.35)',
      },
      animation: {
        'slow-zoom': 'slowZoom 25s linear infinite alternate',
        'fade-up': 'fadeUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 1.5s ease-out forwards',
        'fall': 'fall 2s linear infinite',
        'spin-slow': 'spin 10s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'blink': 'blink 4s infinite',
        'sound-wave': 'soundWave 0.5s infinite',
        'draw-line': 'draw 1.5s ease-out forwards',
      },
      keyframes: {
        slowZoom: {
          '0%': { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.15)' },
        },
        fadeUp: {
          from: { opacity: 0, transform: 'translateY(20px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        draw: {
          to: { strokeDashoffset: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        blink: {
          '0%, 96%, 100%': { opacity: 1, transform: 'scaleY(1)' },
          '98%': { opacity: 0.5, transform: 'scaleY(0.1)' },
        },
        soundWave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.5)' },
        },
      },
    },
  },
  plugins: [],
};
