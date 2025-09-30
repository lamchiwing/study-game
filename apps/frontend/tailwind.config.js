// apps/frontend/tailwind.config.js
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // 如果有共用元件庫，也一起加入：
    // "../../packages/ui/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // 允許動態產生的實用類別被保留
    { pattern: /(bg|text|border)-(red|emerald|sky)-(100|300|500|700)/ },
    // 需要更多深淺可再加：/(50|900)/ 等
  ],
  theme: { extend: {} },
  plugins: [],
};
