/**
 * StatGrid — a compact row of 2-4 numeric summaries (e.g. "3 overdue steps").
 *
 * TABLE, NOT FLEX OR GRID — same reason as DetailRows (see its header):
 * Outlook Windows renders through the Word engine, which supports neither.
 * Each per-stat cell is itself a NESTED presentation table with the value
 * stacked above the label, because Word only reliably stacks content inside
 * nested tables — two sibling `<div>`s inside a `<td>` do not reflow the same
 * way there.
 *
 * `fontVariantNumeric: 'tabular-nums'` is a known CSSProperties key (unlike
 * the `mso-hide` case tokens.ts warns about) and stops digit widths jittering
 * between different counts sharing the same column.
 *
 * DARK MODE REUSES EXISTING CLASSES ONLY. Every `.dc-dark-*` rule is defined
 * once, in Shell.tsx's private `CSS` block, which this component does not
 * (and must not) touch. `.dc-dark-label` already means "a label that carries
 * a border" — exactly what a per-stat cell's divider is — so the outer `<td>`
 * uses it for the border colour, and the inner label cell reuses it a second
 * time for its text colour. The outer cell's `!important` colour does not
 * leak onto the value: the inner value/label cells carry their own inline
 * `color`, and an inline declaration on a descendant always wins over an
 * ancestor's `!important`, regardless of specificity.
 */

import * as React from 'react';
import { colors, styles } from './tokens';

export type Stat = {
  value: string;
  label: string;
};

export type StatGridProps = {
  stats: Stat[];
};

export const StatGrid: React.FC<StatGridProps> = ({ stats }) => {
  if (stats.length === 0) return null;

  const perRow = Math.min(stats.length, 4);
  const cellWidth = `${100 / perRow}%`;

  const rows: Stat[][] = [];
  for (let i = 0; i < stats.length; i += perRow) {
    rows.push(stats.slice(i, i + perRow));
  }

  return (
    <table
      role="presentation"
      border={0}
      cellPadding="0"
      cellSpacing="0"
      width="100%"
      style={styles.statTable}
    >
      <tbody>
        {rows.map((row, rowIndex) => (
          // eslint-disable-next-line react/no-array-index-key -- rows have no stable identity of their own
          <tr key={rowIndex}>
            {row.map((stat, colIndex) => {
              const isFirstInRow = colIndex % perRow === 0;
              const borderLeft = isFirstInRow ? undefined : `1px solid ${colors.border}`;

              return (
                // eslint-disable-next-line react/no-array-index-key -- column position is the identity here
                <td
                  key={colIndex}
                  className="dc-dark-label"
                  width={cellWidth}
                  style={{ width: cellWidth, borderLeft, verticalAlign: 'top' }}
                >
                  <table
                    role="presentation"
                    border={0}
                    cellPadding="0"
                    cellSpacing="0"
                    width="100%"
                    style={{ borderCollapse: 'collapse' }}
                  >
                    <tbody>
                      <tr>
                        <td className="dc-dark-text" style={styles.statValue}>
                          {stat.value}
                        </td>
                      </tr>
                      <tr>
                        <td className="dc-dark-label" style={styles.statLabel}>
                          {stat.label}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              );
            })}
            {/* Pad a short final row so its columns still line up with the
                first row's, rather than compressing wider. No border, no
                content — a spacer, not a stat. */}
            {row.length < perRow &&
              Array.from({ length: perRow - row.length }).map((_, padIndex) => (
                // eslint-disable-next-line react/no-array-index-key -- padding cells have no identity
                <td key={`pad-${padIndex}`} width={cellWidth} style={{ width: cellWidth }} />
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default StatGrid;
