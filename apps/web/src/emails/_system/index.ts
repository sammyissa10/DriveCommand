/**
 * Email design system — public surface.
 *
 * Import from `@/emails/_system`, never from the individual files, so the
 * module boundary stays a real one and a future reorganisation is internal.
 *
 * The 29 standalone templates in `src/emails/*.tsx` do NOT use this yet; each
 * still opens its own <Html> with its own copied style object. Migrating them
 * is deliberately separate work — this module is the destination they migrate
 * to, not a change to them.
 */

export { Shell, type ShellProps } from './Shell';
export { Header, type HeaderProps } from './Header';
export { Footer, type FooterProps } from './Footer';
export { Preheader, type PreheaderProps } from './Preheader';
export { Button, type ButtonProps } from './Button';
export { DetailRows, type DetailRow, type DetailRowsProps } from './DetailRows';
export { StatGrid, type Stat, type StatGridProps } from './StatGrid';
export { StatusBar, type StatusBarProps } from './StatusBar';

export {
  colors,
  darkColors,
  tints,
  tintAccents,
  fonts,
  fontSizes,
  lineHeights,
  space,
  metrics,
  styles,
  type StatusTone,
} from './tokens';
