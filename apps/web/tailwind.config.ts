import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ["class"],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			status: {
  				success: {
  					DEFAULT: 'hsl(var(--status-success))',
  					foreground: 'hsl(var(--status-success-foreground))',
  					bg: 'hsl(var(--status-success-bg))'
  				},
  				warning: {
  					DEFAULT: 'hsl(var(--status-warning))',
  					foreground: 'hsl(var(--status-warning-foreground))',
  					bg: 'hsl(var(--status-warning-bg))'
  				},
  				danger: {
  					DEFAULT: 'hsl(var(--status-danger))',
  					foreground: 'hsl(var(--status-danger-foreground))',
  					bg: 'hsl(var(--status-danger-bg))'
  				},
  				info: {
  					DEFAULT: 'hsl(var(--status-info))',
  					foreground: 'hsl(var(--status-info-foreground))',
  					bg: 'hsl(var(--status-info-bg))'
  				},
  				purple: {
  					DEFAULT: 'hsl(var(--status-purple))',
  					foreground: 'hsl(var(--status-purple-foreground))',
  					bg: 'hsl(var(--status-purple-bg))'
  				}
  			},
  			// DriveCommand Brand Neutrals (11-step scale)
  			n: {
  				'000': 'var(--color-n-000)',
  				'050': 'var(--color-n-050)',
  				'100': 'var(--color-n-100)',
  				'200': 'var(--color-n-200)',
  				'300': 'var(--color-n-300)',
  				'400': 'var(--color-n-400)',
  				'500': 'var(--color-n-500)',
  				'600': 'var(--color-n-600)',
  				'700': 'var(--color-n-700)',
  				'800': 'var(--color-n-800)',
  				'900': 'var(--color-n-900)',
  			},
  			// DriveCommand Brand Blue (9-step scale)
  			b: {
  				'050': 'var(--color-b-050)',
  				'100': 'var(--color-b-100)',
  				'200': 'var(--color-b-200)',
  				'300': 'var(--color-b-300)',
  				'400': 'var(--color-b-400)',
  				'500': 'var(--color-b-500)',
  				'600': 'var(--color-b-600)',
  				'700': 'var(--color-b-700)',
  				'800': 'var(--color-b-800)',
  			},
  			// DriveCommand Semantic Colors
  			brand: {
  				success: 'var(--color-success)',
  				warning: 'var(--color-warning)',
  				critical: 'var(--color-critical)',
  				info: 'var(--color-info)',
  			},
  			// Hero Surface Colors (auth/marketing pages)
  			'ink-navy': 'var(--color-ink-navy)',
  			'surface-navy': 'var(--color-surface-navy)',
  		},
  		// DriveCommand Brand Shadows
  		boxShadow: {
  			'1': 'var(--shadow-1)',
  			'2': 'var(--shadow-2)',
  			'3': 'var(--shadow-3)',
  		},
  		transitionDuration: {
  			fast: 'var(--transition-fast)',
  			base: 'var(--transition-base)',
  			slow: 'var(--transition-slow)',
  			// Brand motion tokens
  			instant: 'var(--duration-instant)',
  			deliberate: 'var(--duration-deliberate)',
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			// Brand radii
  			'brand-sm': 'var(--radius-sm)',
  			'brand-md': 'var(--radius-md)',
  			'brand-lg': 'var(--radius-lg)',
  		},
  		// DriveCommand Typography Scale
  		fontSize: {
  			'display': ['96px', { lineHeight: '92px', fontWeight: '600' }],
  			'headline': ['64px', { lineHeight: '64px', fontWeight: '600' }],
  			'h1': ['32px', { lineHeight: '40px', fontWeight: '600' }],
  			'h2': ['24px', { lineHeight: '32px', fontWeight: '600' }],
  			'h3': ['18px', { lineHeight: '28px', fontWeight: '600' }],
  			'body': ['16px', { lineHeight: '26px', fontWeight: '400' }],
  			'small': ['13px', { lineHeight: '20px', fontWeight: '400' }],
  			'label': ['12px', { lineHeight: '16px', fontWeight: '500' }],
  			'data': ['14px', { lineHeight: '20px', fontWeight: '400' }],
  		},
  		// DriveCommand Font Families
  		fontFamily: {
  			display: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
  			sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
  			mono: ['var(--font-jetbrains-mono)', 'monospace'],
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [],
};
export default config;
