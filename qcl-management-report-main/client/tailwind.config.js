/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        corporate: {
          50: '#F0F7FF',
          100: '#E0EFFF',
          200: '#BAE0FF',
          500: '#0284C7',
          600: '#0369A1',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#0F172A',
        },
        spic: {
          DEFAULT: '#059669',
          dark: '#047857',
          light: '#D1FAE5',
        },
        tfl: {
          DEFAULT: '#2563EB',
          dark: '#1D4ED8',
          light: '#DBEAFE',
        },
        greenstar: {
          DEFAULT: '#0D9488',
          dark: '#0F766E',
          light: '#CCFBF1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)',
        glow: '0 0 15px rgba(37, 99, 235, 0.25)',
      },
    },
  },
  plugins: [],
}
