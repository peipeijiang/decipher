/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm charcoal base
        base: {
          50:  '#f8f7f5',
          100: '#f0eeea',
          200: '#e3e0da',
          300: '#d1cdc5',
          400: '#a09b91',
          500: '#7d7870',
          600: '#5e5a54',
          700: '#46433e',
          800: '#2d2b27',
          900: '#1a1916',
        },
        // Amber accent — breaks the blue/purple AI look
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Keep Tailwind's gray for compatibility, re-tint to warm
        gray: {
          50:  '#f8f7f5',
          100: '#f0eeea',
          200: '#e3e0da',
          300: '#d1cdc5',
          400: '#a09b91',
          500: '#7d7870',
          600: '#5e5a54',
          700: '#46433e',
          800: '#2d2b27',
          900: '#1a1916',
        },
        // Subtle accent colors
        accent: {
          DEFAULT: '#d97706',
          light: '#fef3c7',
          dark: '#b45309',
        },
        surface: {
          DEFAULT: '#faf9f7',
          raised: '#ffffff',
          overlay: 'rgba(250, 249, 247, 0.85)',
        },
        text: {
          primary: '#1a1916',
          secondary: '#5e5a54',
          muted: '#a09b91',
        },
        status: {
          success: '#059669',
          warning: '#d97706',
          error: '#dc2626',
          info: '#0d9488',
        },
      },
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 2px rgba(146,64,14,0.04), 0 2px 8px rgba(146,64,14,0.06), 0 0 0 1px rgba(146,64,14,0.03)',
        'card-hover': '0 2px 4px rgba(146,64,14,0.06), 0 4px 16px rgba(146,64,14,0.10), 0 0 0 1px rgba(146,64,14,0.06)',
        'amber': '0 1px 3px rgba(217,119,6,0.25)',
        'amber-lg': '0 2px 6px rgba(217,119,6,0.35)',
      },
      borderRadius: {
        'sm': '0.375rem',
        'md': '0.5rem',
        'lg': '0.625rem',
        'xl': '0.75rem',
        '2xl': '0.875rem',
      },
    },
  },
  plugins: [],
}
