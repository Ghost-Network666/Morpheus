/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:     "rgb(var(--color-bg-rgb) / <alpha-value>)",
        panel:  "rgb(var(--color-panel-rgb) / <alpha-value>)",
        border: "rgb(var(--color-border-rgb) / <alpha-value>)",
        accent: "rgb(var(--color-accent-rgb) / <alpha-value>)",
        text:   "rgb(var(--color-text-rgb) / <alpha-value>)",
        muted:  "rgb(var(--color-muted-rgb) / <alpha-value>)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
