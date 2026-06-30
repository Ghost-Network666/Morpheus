/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f17",
        panel: "#161620",
        border: "#262633",
        accent: "#7c5cff",
        text: "#e4e4ec",
        muted: "#8b8b9e",
      },
    },
  },
  plugins: [],
};
