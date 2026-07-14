/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── DriveCommand Mobile Design System (Apple language, dark) ─────────
        // Namespaced under `ds` so the redesign palette adds without colliding
        // with the legacy bg/success/warning/danger tokens used by live screens.
        // Source of truth: .planning/mobile-design-system.md + docs/specs PDF.
        ds: {
          bg: '#0B1120',        // screen background
          card: '#171E2E',      // cards & list rows (never a border)
          elevated: '#212A3D',  // segmented thumb, pressed, skeleton fill
          input: '#1E2638',     // text field fill (edit mode & sheets)
          hairline: '#232C40',  // dividers inside grouped rows only
          txt: '#F5F7FA',       // titles, values (text.primary)
          txt2: '#8B93A7',      // labels, sublines (text.secondary)
          txt3: '#5B6478',      // meta, placeholders, inactive icons (text.muted)
          initials: '#DDE3F0',  // monogram / unit-chip glyphs
          accent: '#0A84FF',    // the only brand color in the UI
          vip: '#FFB340',       // VIP tag only (15% fill)
          success: '#30D158',   // ready / on-duty / paid
          warning: '#FF9F0A',   // expiring docs / service due / in shop
          danger: '#FF453A',    // destructive / overdue / HOS violation
          avatar: '#2B3550',    // monogram & unit-chip fill
          sheet: '#141B2B',     // bottom-sheet fill
        },

        // Semantic CSS variable aliases — switch automatically with theme class
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        'surface-card': 'rgb(var(--color-surface-card) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        'surface-input': 'rgb(var(--color-surface-input) / <alpha-value>)',
        'theme-border': 'rgb(var(--color-border) / <alpha-value>)',
        'theme-border-light': 'rgb(var(--color-border-light) / <alpha-value>)',
        'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--color-text-secondary) / <alpha-value>)',
        'text-tertiary': 'rgb(var(--color-text-tertiary) / <alpha-value>)',
        'tab-bar-bg': 'rgb(var(--color-tab-bar-bg) / <alpha-value>)',
        'tab-bar-border': 'rgb(var(--color-tab-bar-border) / <alpha-value>)',

        // Static brand and status colors (aligned with constants/tokens.ts)
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
