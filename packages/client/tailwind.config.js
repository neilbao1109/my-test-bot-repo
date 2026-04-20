/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f7ff',
          100: '#e0efff',
          200: '#b9dfff',
          300: '#7cc4ff',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: '#0056b3',
          800: '#004994',
          900: '#003d7a',
        },
        dark: {
          bg: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          border: 'var(--color-border)',
          hover: 'var(--color-hover)',
          text: 'var(--color-text)',
          muted: 'var(--color-muted)',
        },
      },
    },
  },
  plugins: [],
};
