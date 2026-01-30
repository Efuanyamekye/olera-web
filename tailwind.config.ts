import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Calm, trustworthy palette for senior care
        primary: {
          50: "#f0f9f4",
          100: "#d9f0e3",
          200: "#b6e1ca",
          300: "#86cba8",
          400: "#52ae82",
          500: "#319266",
          600: "#227551",
          700: "#1c5e43",
          800: "#194b37",
          900: "#163e2f",
          950: "#0b231a",
        },
        secondary: {
          50: "#f5f7fa",
          100: "#eaeef4",
          200: "#d1dbe6",
          300: "#a9bcd0",
          400: "#7b98b5",
          500: "#5a7a9c",
          600: "#466182",
          700: "#3a4f6a",
          800: "#334459",
          900: "#2e3b4c",
          950: "#1f2733",
        },
        warm: {
          50: "#fdf8f3",
          100: "#f9ede0",
          200: "#f2d8bd",
          300: "#e9bd91",
          400: "#df9a62",
          500: "#d67f42",
          600: "#c86837",
          700: "#a6522f",
          800: "#85432c",
          900: "#6c3926",
          950: "#3a1b12",
        },
      },
    },
  },
  plugins: [],
};

export default config;
