/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#09090f',
        surface: '#101018',
        card: '#18182a',
        border: '#2a2a40',
        accent: '#a855f7',
        accent2: '#ec4899',
        warning: '#ffb347',
        danger: '#ff5f5f',
        muted: '#6b6b85',
        text: '#ece8f8'
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #a855f7, #ec4899)',
        'gradient-card': 'linear-gradient(135deg, #18182a, #1e1e30)'
      },
      animation: {
        'wave': 'wave 1.2s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'blink': 'blink 1s step-end infinite'
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1.5)' }
        },
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: 1 },
          '50%': { transform: 'scale(1.15)', opacity: 0.7 },
          '100%': { transform: 'scale(1)', opacity: 1 }
        },
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 }
        },
        'slide-up': {
          from: { transform: 'translateY(16px)', opacity: 0 },
          to: { transform: 'translateY(0)', opacity: 1 }
        },
        'blink': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0 }
        }
      }
    }
  },
  plugins: []
}
