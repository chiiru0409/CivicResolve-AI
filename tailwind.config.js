/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // ── CivicResolve Racing Palette ──────────────────────
        civic: {
          red:        '#E10600',
          'red-dark': '#B80500',
          'red-light':'#FF1A15',
          yellow:     '#FFC400',
          'yellow-dark': '#E6B000',
          black:      '#090909',
          carbon:     '#111111',
          surface:    '#181818',
          elevated:   '#242424',
          border:     '#2E2E2E',
          'border-light': '#3A3A3A',
          text:       '#F5F5F5',
          muted:      '#9A9A9A',
          success:    '#22C55E',
          warning:    '#FFC400',
          danger:     '#E10600',
          info:       '#3B82F6',
        },
      },
      backgroundImage: {
        'carbon-fiber': `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(255,255,255,0.015) 2px,
          rgba(255,255,255,0.015) 4px
        ),
        repeating-linear-gradient(
          90deg,
          transparent,
          transparent 2px,
          rgba(255,255,255,0.015) 2px,
          rgba(255,255,255,0.015) 4px
        )`,
        'speed-lines': `repeating-linear-gradient(
          -55deg,
          transparent,
          transparent 6px,
          rgba(225,6,0,0.04) 6px,
          rgba(225,6,0,0.04) 7px
        )`,
        'red-glow': 'radial-gradient(ellipse at center, rgba(225,6,0,0.15) 0%, transparent 70%)',
        'yellow-glow': 'radial-gradient(ellipse at center, rgba(255,196,0,0.12) 0%, transparent 70%)',
      },
      boxShadow: {
        'red-glow':    '0 0 20px rgba(225,6,0,0.3), 0 0 40px rgba(225,6,0,0.1)',
        'red-sm':      '0 0 10px rgba(225,6,0,0.2)',
        'yellow-glow': '0 0 20px rgba(255,196,0,0.3)',
        'dark-lg':     '0 20px 60px rgba(0,0,0,0.6)',
        'dark-md':     '0 8px 30px rgba(0,0,0,0.4)',
        'dark-sm':     '0 4px 15px rgba(0,0,0,0.3)',
        'card':        '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        'card-hover':  '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'pulse-slow':     'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':      'spin 3s linear infinite',
        'bounce-gentle':  'bounce 2s infinite',
        'fade-in':        'fadeIn 0.5s ease-in-out',
        'slide-up':       'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'glow-pulse':     'glowPulse 2s ease-in-out infinite',
        'counter':        'counterUp 1s ease-out forwards',
        'shimmer':        'shimmer 2s infinite',
        'speed-line':     'speedLine 0.8s ease-out forwards',
        'rev-up':         'revUp 0.6s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%':   { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(225,6,0,0.2)' },
          '50%':      { boxShadow: '0 0 25px rgba(225,6,0,0.5), 0 0 50px rgba(225,6,0,0.2)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        speedLine: {
          '0%':   { transform: 'scaleX(0)', opacity: '0' },
          '60%':  { opacity: '1' },
          '100%': { transform: 'scaleX(1)', opacity: '0.6' },
        },
        revUp: {
          '0%':   { transform: 'scale(0.95)', opacity: '0' },
          '60%':  { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
