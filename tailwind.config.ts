import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        volter: ['Volter', 'monospace'],
        sans: ['Volter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        habbo: {
          gold: "hsl(var(--habbo-gold))",
          orange: "hsl(var(--habbo-orange))",
          blue: "hsl(var(--habbo-blue))",
          dark: "hsl(var(--habbo-dark))",
          light: "hsl(var(--habbo-light))",
        },
        hp: "hsl(var(--hp-bar))",
        mp: "hsl(var(--mp-bar))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "bump-left": {
          "0%": { transform: "translateX(0) scale(1)" },
          "40%": { transform: "translateX(-20px) scale(1.05)" },
          "100%": { transform: "translateX(0) scale(1)" }
        },
        "bump-right": {
          "0%": { transform: "translateX(0) scale(1)" },
          "40%": { transform: "translateX(20px) scale(1.05)" },
          "100%": { transform: "translateX(0) scale(1)" }
        },
        "marquee-left": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" }
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bump-left": "bump-left 0.4s cubic-bezier(0.36, 0, 0.66, -0.56)",
        "bump-right": "bump-right 0.4s cubic-bezier(0.36, 0, 0.66, -0.56)",
        "marquee-left": "marquee-left 40s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
