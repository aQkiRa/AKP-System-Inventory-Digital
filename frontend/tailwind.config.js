/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff9ff',
          100: '#dcf1ff',
          200: '#b3e4ff',
          300: '#75d1ff',
          400: '#2fb8ff',
          500: '#0398f0',
          600: '#0079cc',
          700: '#0161a5',
          800: '#075287',
          900: '#0c4570',
        },
      },
    },
  },
  plugins: [],
};
