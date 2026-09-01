/**
 * DetailRows — a label/value list that reads like a dispatch record.
 *
 * The problem this solves: the trip reminder currently renders as one run-on
 * sentence — "trip DC-2026-00412 has not been started. Truck T-104, first stop
 * Hall Ford, West Bend, departure Tue 26 Aug, 06:30." A driver scanning on a
 * phone has to parse prose to find the departure time. As rows, each fact has a
 * fixed position and the eye goes straight to it.
 *
 * TABLE, NOT FLEX OR GRID — and not merely as a style preference. Outlook
 * Windows renders through Word, which supports neither, and would stack every
 * label above its value in a single column.
 *
 * The last row omits its bottom border so the list does not appear to be
 * missing a final entry.
 */

import * as React from 'react';
import { colors, styles } from './tokens';

export type DetailRow = {
  label: string;
  value: string;
};

export type DetailRowsProps = {
  rows: DetailRow[];
};

export const DetailRows: React.FC<DetailRowsProps> = ({ rows }) => {
  if (rows.length === 0) return null;

  return (
    <table
      role="presentation"
      border={0}
      cellPadding="0"
      cellSpacing="0"
      width="100%"
      style={styles.detailTable}
    >
      <tbody>
        {rows.map((row, i) => {
          const isLast = i === rows.length - 1;
          const borderBottom = isLast ? 'none' : `1px solid ${colors.border}`;

          return (
            <tr key={`${row.label}-${i}`}>
              <td
                className="dc-dark-label"
                style={{ ...styles.detailLabel, borderBottom }}
              >
                {row.label}
              </td>
              <td
                className="dc-dark-text"
                style={{ ...styles.detailValue, borderBottom }}
              >
                {row.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default DetailRows;
