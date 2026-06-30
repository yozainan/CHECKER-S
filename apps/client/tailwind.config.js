/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        board: {
          dark: "#0f172a",  /* Deep slate-900 */
          light: "#334155", /* Mid slate-700 */
        }
      }
    },
  },
  plugins: [],
}
