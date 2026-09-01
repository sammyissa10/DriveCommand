/**
 * Email design tokens — the single source of every colour, font and measurement
 * used by the transactional email system.
 *
 * RULE: no component under `_system/` may contain a hex literal, a font stack or
 * a raw pixel value that belongs to the brand. They import from here. The one
 * category of literal left in the components is structural HTML attributes that
 * are not brand values (border="0", cellPadding="0", width="100%").
 *
 * ---------------------------------------------------------------------------
 * NO WEB FONTS, DELIBERATELY
 * ---------------------------------------------------------------------------
 * There is no @import and no <link> to Google Fonts anywhere in this system.
 * Outlook Windows strips them, Gmail strips them, and the ones that survive
 * cost a blocking network request to render a notification. Both stacks name
 * the brand face FIRST — so a client that happens to have DM Sans or Inter
 * installed uses it — and then fall through to Helvetica/Arial, which is what
 * almost every recipient will actually see. That is the intended outcome, not a
 * degradation to apologise for.
 *
 * ---------------------------------------------------------------------------
 * WHY `styles` EXISTS BESIDE `colors`
 * ---------------------------------------------------------------------------
 * React Email renders `style` objects to inline CSS, and inline CSS is the only
 * thing Outlook Windows reliably honours. Pre-building the style objects here
 * means a component cannot quietly invent `#0066CD`, and it means a brand change
 * is one edit in one file rather than a grep across eight components.
 */

import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const colors = {
  /** Primary brand blue. Buttons, links, the header accent rule. */
  signalBlue: '#0066CC',
  /** Header band, headings, and text on tinted strips. */
  navy: '#002654',
  /** Page background behind the card, and the footer band. */
  bone: '#F5F5F7',
  /** Attention / alert accent. Never used for a primary action. */
  orange: '#FF9F0A',
  /** Informational accent. */
  sky: '#5AC8FA',
  /** Dark-mode page background. */
  chrome: '#0F141F',

  // Neutral ramp
  border: '#E4E7EC',
  textPrimary: '#14181F',
  textSecondary: '#5A6472',
  white: '#FFFFFF',
} as const;

/**
 * Dark-mode values. These are applied ONLY inside a
 * `@media (prefers-color-scheme: dark)` block via `.dc-dark-*` classes, never
 * inline — see Shell.tsx for why that separation is what keeps Outlook safe.
 */
export const darkColors = {
  pageBg: colors.chrome,
  cardBg: '#161C27',
  border: '#2A3140',
  textPrimary: colors.bone,
  textSecondary: '#9AA4B2',
  /** Lightened so it clears WCAG AA against the dark card. */
  link: '#5AA9FF',
} as const;

/** Background tints for StatusBar tones. Paired with a matching accent. */
export const tints = {
  info: '#EAF4FF',
  attention: '#FFF6E5',
  success: '#E8F6EE',
} as const;

export const tintAccents = {
  info: colors.signalBlue,
  attention: colors.orange,
  success: '#1F9D55',
} as const;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export const fonts = {
  headingStack: "'DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif",
  bodyStack: "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif",
} as const;

export const fontSizes = {
  wordmark: '18px',
  h1: '22px',
  h2: '18px',
  body: '15px',
  button: '16px',
  small: '13px',
  fine: '12px',
} as const;

export const lineHeights = {
  heading: '28px',
  body: '24px',
  small: '20px',
  fine: '18px',
} as const;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** 4px scale. Index by step: space[4] === '16px'. */
export const space = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
} as const;

export const metrics = {
  /** Hard requirement: Gmail clips wider, and every client agrees on 600. */
  containerWidth: 600,
  /** Header band height. Deliberately not the old 76px slab. */
  headerHeight: 56,
  /** Signal Blue rule under the header band. */
  accentRuleHeight: 3,
  logoDisplayPx: 24,
  radius: '8px',
  buttonRadius: '6px',
  /** Accessible minimum tap target. */
  minTapHeight: 44,
} as const;

// ---------------------------------------------------------------------------
// Pre-built inline style objects
// ---------------------------------------------------------------------------

type Style = CSSProperties;

export const styles: Record<string, Style> = {
  // --- page / card -------------------------------------------------------
  pageBody: {
    backgroundColor: colors.bone,
    margin: 0,
    padding: 0,
    width: '100%',
    fontFamily: fonts.bodyStack,
    // Stops iOS/Windows clients auto-inflating small text.
    WebkitTextSizeAdjust: '100%',
    textSizeAdjust: '100%',
  },
  pageTable: {
    backgroundColor: colors.bone,
    width: '100%',
    borderCollapse: 'collapse',
  },
  pageCell: {
    padding: `${space[10]} ${space[3]}`,
    verticalAlign: 'top',
  },
  card: {
    width: `${metrics.containerWidth}px`,
    maxWidth: '100%',
    backgroundColor: colors.white,
    borderRadius: metrics.radius,
    border: `1px solid ${colors.border}`,
    borderCollapse: 'separate',
    overflow: 'hidden',
  },

  // --- header ------------------------------------------------------------
  headerCell: {
    backgroundColor: colors.navy,
    height: `${metrics.headerHeight}px`,
    padding: `0 ${space[6]}`,
    verticalAlign: 'middle',
  },
  wordmark: {
    fontFamily: fonts.headingStack,
    fontSize: fontSizes.wordmark,
    fontWeight: 700,
    color: colors.white,
    letterSpacing: '-0.2px',
    lineHeight: `${metrics.headerHeight}px`,
    margin: 0,
    padding: 0,
    whiteSpace: 'nowrap',
  },
  logoImg: {
    display: 'block',
    border: '0',
    outline: 'none',
    textDecoration: 'none',
  },
  accentRule: {
    height: `${metrics.accentRuleHeight}px`,
    lineHeight: `${metrics.accentRuleHeight}px`,
    fontSize: `${metrics.accentRuleHeight}px`,
  },

  // --- body --------------------------------------------------------------
  bodyCell: {
    padding: `${space[7]} ${space[8]} ${space[6]} ${space[8]}`,
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    color: colors.textPrimary,
  },

  // --- status bar --------------------------------------------------------
  statusCellBase: {
    padding: `${space[3]} ${space[8]}`,
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    fontWeight: 600,
    color: colors.navy,
  },

  // --- detail rows -------------------------------------------------------
  detailTable: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  detailLabel: {
    width: '38%',
    padding: `${space[3]} ${space[3]} ${space[3]} 0`,
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    verticalAlign: 'top',
    textAlign: 'left',
  },
  detailValue: {
    padding: `${space[3]} 0`,
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: 600,
    color: colors.textPrimary,
    verticalAlign: 'top',
    textAlign: 'left',
  },

  // --- button ------------------------------------------------------------
  buttonTable: {
    borderCollapse: 'separate',
  },
  buttonCell: {
    backgroundColor: colors.signalBlue,
    borderRadius: metrics.buttonRadius,
    textAlign: 'center',
    // 14px vertical / 28px horizontal, which clears the 44px tap floor once the
    // 16px/22px line box is added.
    padding: '14px 28px',
  },
  buttonLink: {
    fontFamily: fonts.headingStack,
    fontSize: fontSizes.button,
    fontWeight: 600,
    color: colors.white,
    textDecoration: 'none',
    display: 'inline-block',
    lineHeight: '22px',
    margin: 0,
  },
  buttonUrlNote: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.fine,
    lineHeight: lineHeights.fine,
    color: colors.textSecondary,
    margin: `${space[3]} 0 0 0`,
    wordBreak: 'break-all',
  },

  // --- footer ------------------------------------------------------------
  footerCell: {
    backgroundColor: colors.bone,
    padding: `${space[5]} ${space[8]}`,
    borderTop: `1px solid ${colors.border}`,
  },
  footerText: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.fine,
    lineHeight: lineHeights.fine,
    color: colors.textSecondary,
    margin: `0 0 ${space[1]} 0`,
  },
  footerLink: {
    color: colors.textSecondary,
    textDecoration: 'underline',
  },

  // --- preheader ---------------------------------------------------------
  preheader: {
    display: 'none',
    maxHeight: 0,
    maxWidth: 0,
    opacity: 0,
    overflow: 'hidden',
    // NOTE: `mso-hide:all` cannot live here — React drops unknown CSS
    // properties. It is emitted as `.dc-preheader { mso-hide: all; }` in the
    // Shell <style> block instead.
    fontSize: '1px',
    lineHeight: '1px',
    color: colors.white,
    visibility: 'hidden',
  },
};

export type StatusTone = keyof typeof tints;
