/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx,md}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        heigit: {
          red: "#ca2333",
          "red-dark": "#a81d2a",
          "red-light": "#f2d7d9",
        },
      },
      fontFamily: {
        sans: ["Inter", "Roboto", "Archivo", "sans-serif"],
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
