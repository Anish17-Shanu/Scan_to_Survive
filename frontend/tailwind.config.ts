import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#111827",
        accent: "#22d3ee",
        danger: "#f43f5e"
      }
    }
  },
  plugins: []
};

export default config;
