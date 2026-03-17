/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0f0f0f",
          card: "#1a1a2e",
          elevated: "#242438",
          hover: "#2e2e4a",
        },
        accent: {
          DEFAULT: "#7c3aed",
          light: "#a855f7",
          dim: "#4c1d95",
        },
        muted: "#888",
        subtle: "#555",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
