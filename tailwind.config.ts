import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0f",       // primary text on white
        muted: "#5a6076",     // secondary text
        soft: "#f4f5f9",      // input background / subtle fills
        border: "#e6e8ef",    // hairline borders
        accent: "#5a3cf6",    // primary purple
        accent2: "#0db8e6",   // teal accent for gradients
        success: "#0e8f53",
        danger: "#c23030",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 0 rgba(10,10,15,0.04), 0 8px 24px -16px rgba(10,10,15,0.10)",
        focus: "0 0 0 4px rgba(90, 60, 246, 0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
