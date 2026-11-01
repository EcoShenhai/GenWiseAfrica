/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        night: { DEFAULT: '#0E0637', 800: '#140A47', 700: '#1B1250', 600: '#2A2068', 500: '#3D3384' },
        gold: { DEFAULT: '#C9A34E', light: '#E6C97A', deep: '#A9832F', pale: '#F3E7C6' },
        emerald: { DEFAULT: '#0B6E4F', 600: '#0F8A63', 50: '#E7F3EE' },
        dawn: { DEFAULT: '#F4F2F9', 200: '#E7E3F1', 300: '#D6D0E6' },
        ink: { DEFAULT: '#1F1B2E', muted: '#5B5770', soft: '#8A86A0' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
      },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
};
