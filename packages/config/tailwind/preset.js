/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf7ee',
          100: '#f5edd6',
          200: '#ebd9ab',
          300: '#dec07b',
          400: '#d3a953',
          500: '#cb9536',
          600: '#b2772b',
          700: '#8e5625',
          800: '#754524',
          900: '#623a22',
          950: '#381e10',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
