# GSD (Get Shit Done) Workflow

Always use the GSD system for development tasks:
- For new projects: use `/gsd:new-project`
- For quick tasks and bug fixes: use `/gsd:quick`
- For feature work: follow the full phase workflow (`/gsd:discuss-phase` → `/gsd:plan-phase` → `/gsd:execute-phase` → `/gsd:verify-work`)
- For progress checks: use `/gsd:progress`

When the user asks you to build, fix, or change code, default to the appropriate GSD command rather than working ad-hoc.

# UI/UX Pro Max — Auto-Trigger

When the user asks about anything design-related, **automatically run the UI UX Pro Max skill** before responding. This includes requests involving:

- Building, designing, or improving UI components or pages
- Choosing colors, fonts, typography, or styles
- Landing pages, dashboards, forms, modals, navbars, sidebars, cards
- Reviewing UI/UX quality, accessibility, or responsiveness
- Dark mode, light mode, theming, or visual polish
- Charts, data visualization, or layout decisions
- Any mention of: design, UI, UX, style, palette, theme, look and feel, visual, aesthetic, responsive, accessibility

**Workflow:**
1. Analyze the request to extract product type, industry, style keywords, and stack
2. Run the design system generator: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --design-system -p "DriveCommand"`
3. For stack-specific guidance: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --stack nextjs`
4. Apply the recommendations when writing code
5. Before delivering, verify against the Pre-Delivery Checklist in the skill's SKILL.md

**DriveCommand defaults:**
- Stack: `nextjs` (Next.js + Tailwind + shadcn/ui)
- Industry: logistics / fleet management / SaaS
- Style: professional, modern, dark mode supported
