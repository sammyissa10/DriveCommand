import React from 'react'
import { cssInterop } from 'nativewind'
import type { LucideIcon } from 'lucide-react-native'
import { icon as iconSize } from './tokens'

/**
 * NativeWind wrapper for lucide-react-native icons.
 *
 * lucide icons take a `color` string prop, not a className. Passing a hex there
 * would violate "no hex literals in components", so we register each icon with
 * cssInterop once — mapping `className` text color onto the icon's `color` prop.
 * That lets callers write `<Icon icon={ChevronRight} className="text-ds-txt3" />`
 * and pull the color straight from the token table.
 */

// Icons cssInterop has already been applied to (idempotent guard).
const patched = new WeakSet<object>()

function ensureInterop(IconCmp: LucideIcon) {
  if (patched.has(IconCmp)) return
  // `as any`: cssInterop's option types key `nativeStyleToProp` off the target's
  // props; lucide's forwardRef component doesn't expose them structurally, so we
  // opt out of the config's generic inference here. Runtime behaviour is correct.
  cssInterop(IconCmp as any, {
    className: {
      target: 'style',
      nativeStyleToProp: { color: true },
    },
  })
  patched.add(IconCmp)
}

export interface IconProps {
  icon: LucideIcon
  /** Tailwind text color class, e.g. `text-ds-accent`. */
  className?: string
  size?: number
  strokeWidth?: number
}

export function Icon({ icon: IconCmp, className, size = iconSize.md, strokeWidth = 2 }: IconProps) {
  ensureInterop(IconCmp)
  return <IconCmp size={size} strokeWidth={strokeWidth} className={className} />
}
