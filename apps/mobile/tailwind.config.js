/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Aligned with constants/tokens.ts
        brand: {
          50: "#f0f9ff",
          DEFAULT: "#0ea5e9",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          900: "#0c4a6e",
          light: "#38bdf8",
        },
        surface: {
          DEFAULT: "#0f172a",
          card: "#1e293b",
          elevated: "#243046",
          input: "#1a2538",
          border: "#2d3d53",
          borderLight: "#1e293b",
          divider: "#1e2d42",
        },
        textPrimary: "#f1f5f9",
        textSecondary: "#94a3b8",
        textTertiary: "#64748b",
        textMuted: "#475569",
        // Status colors aligned with tokens
        success: {
          DEFAULT: "#22c55e",
          bg: "rgba(34,197,94,0.12)",
        },
        warning: {
          DEFAULT: "#f59e0b",
          bg: "rgba(245,158,11,0.12)",
        },
        danger: {
          DEFAULT: "#ef4444",
          bg: "rgba(239,68,68,0.12)",
        },
        info: {
          DEFAULT: "#3b82f6",
          bg: "rgba(59,130,246,0.12)",
        },
      },
      fontFamily: {
        sans: ["System"],
        heading: ["Poppins-SemiBold"],
      }
    }
  },
  plugins: [],
}
