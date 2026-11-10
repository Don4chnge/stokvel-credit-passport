import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#101B19",
        pine: "#1C2B26",
        ivory: "#F4F1E8",
        lime: "#C6E66B",
        copper: "#B78A62",
        sage: "#A8B8AE",
        line: "#2B3D36",
        deep: "#0B1412",
      },
      fontFamily: {
        serif: ['"Fraunces Variable"', "Georgia", "serif"],
        sans: ['"Instrument Sans Variable"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: {
        // Classic scale, ratio 4:3 from a 16px base
        xs: ["0.75rem", "1.1rem"], sm: ["0.875rem", "1.35rem"], base: ["1rem", "1.6rem"],
        lg: ["1.125rem", "1.75rem"], xl: ["1.333rem", "1.9rem"], "2xl": ["1.777rem", "2.2rem"],
        "3xl": ["2.369rem", "2.7rem"], "4xl": ["3.157rem", "3.4rem"], "5xl": ["4.209rem", "4.3rem"],
        "6xl": ["5.61rem", "5.5rem"],
      },
      borderRadius: { card: "14px" },
      maxWidth: { page: "76rem" },
    },
  },
  plugins: [],
};
export default config;
