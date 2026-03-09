/** @type {import('tailwindcss').Config} */
//
// NativeWind v4 requires Tailwind CSS v3 — do NOT upgrade to v4 here.
// The theme tokens below are kept in sync with the web app's CSS variables
// so both platforms share the same visual language.
//

module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ── Gold palette ──────────────────────────────────
        gold: {
          50:  '#fffdf0',
          100: '#fef9d3',
          200: '#fdf0a0',
          300: '#fce26a',
          400: '#f9ce3a',
          500: '#e8b422',   // primary accent
          600: '#c99510',
          700: '#a57509',
          800: '#7e580a',
          900: '#5c3f0b',
          950: '#341f04',
        },
        // ── Stone / warm gray ─────────────────────────────
        stone: {
          50:  '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
          950: '#0c0a09',
        },
        // ── App surface tones ─────────────────────────────
        surface: {
          base:    '#111110',
          raised:  '#1a1917',
          overlay: '#242220',
          subtle:  '#2e2c29',
        },
        // ── Status ────────────────────────────────────────
        success: '#4ade80',
        warning: '#fbbf24',
        danger:  '#f87171',
        info:    '#60a5fa',
      },
      fontFamily: {
        sans:    ['Geist-Regular', 'system-ui'],
        medium:  ['Geist-Medium'],
        bold:    ['Geist-Bold'],
        display: ['PlayfairDisplay-Bold', 'Georgia'],
        mono:    ['GeistMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm:  '6px',
        md:  '10px',
        lg:  '16px',
        xl:  '22px',
        '2xl': '32px',
      },
    },
  },
  plugins: [],
}
