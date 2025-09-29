/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",   // 👈 掃描 src 裡的檔案
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
