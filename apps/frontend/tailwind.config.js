/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    { pattern: /(bg|text|border)-(red|emerald|sky)-(100|300|500|700)/ },
  ],
  theme: { extend: {} },
  plugins: [],
};
