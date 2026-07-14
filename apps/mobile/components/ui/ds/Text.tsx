import React from 'react'
import { Text as RNText, type TextProps as RNTextProps } from 'react-native'

/**
 * The nine — and only nine — type styles from the design system (Section 04).
 * Every text element in the app is one of these. No one-off sizes.
 * A trailing `className` always wins, so callers can retint (e.g. a status
 * value) without introducing a new size.
 */
export type TextVariant =
  | 'largeTitle' // 34 / Bold  — overview page titles
  | 'title' // 22 / Bold  — detail header entity name, KPI value
  | 'rowTitle' // 17 / Semibold — row titles, centered stack headers
  | 'body' // 15–16 / Regular — values, inputs, sublines
  | 'caption' // 13 / Regular — meta lines, helper text
  | 'sectionLabel' // 12 / Semibold UPPERCASE +0.8 — group headers
  | 'tag' // 11 / Bold — VIP & status pill labels
  | 'kpi' // 22 / Bold — numbers inside KPI cards

const VARIANT: Record<TextVariant, string> = {
  largeTitle: 'text-[34px] font-bold text-ds-txt',
  title: 'text-[22px] font-bold text-ds-txt',
  rowTitle: 'text-[17px] font-semibold text-ds-txt',
  body: 'text-[16px] text-ds-txt',
  caption: 'text-[13px] text-ds-txt2',
  sectionLabel: 'text-[12px] font-semibold uppercase tracking-[0.8px] text-ds-txt2',
  tag: 'text-[11px] font-bold',
  kpi: 'text-[22px] font-bold text-ds-txt',
}

export interface DSTextProps extends RNTextProps {
  variant?: TextVariant
  className?: string
}

export function Text({ variant = 'body', className, ...rest }: DSTextProps) {
  return <RNText className={`${VARIANT[variant]} ${className ?? ''}`} {...rest} />
}
