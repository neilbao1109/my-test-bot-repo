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
          400: '#36a6ff',
          500: '#0c8cff',
          600: '#006cdb',
          700: '#0056b3',
          800: '#004994',
          900: '#003d7a',
        },
        dark: {
          bg: '#1a1b1e',
          surface: '#25262b',
          border: '#373a40',
          hover: '#2c2e33',
          text: '#c1c2c5',
          muted: '#909296',
        },
      },
    },
  },
  plugins: [],
};
