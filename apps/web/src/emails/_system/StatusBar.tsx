/**
 * StatusBar — one tinted strip directly under the header.
 *
 * This is what turns "trip DC-2026-00412 has not been started" from a sentence
 * buried in a paragraph into something a dispatcher registers at a glance. It
 * is optional; an email with nothing to flag omits it rather than rendering a
 * neutral strip that means nothing.
 *
 * The tone is carried by colour AND by the label text, never by colour alone —
 * a strip that is only distinguishable by hue is invisible to a colour-blind
 * reader and to anyone whose client strips backgrounds.
 *
 * `borderLeft` is deliberately paired with a matching `bgcolor` attribute:
 * Outlook Windows honours the HTML attribute reliably and `background-color`
 * only sometimes, so the strip keeps its tint even where the CSS is dropped.
 */

import * as React from 'react';
import { styles, tintAccents, tints, type StatusTone } from './tokens';

export type StatusBarProps = {
  tone: StatusTone;
  /** Short — this is a glanceable label, not a sentence. */
  label: string;
};

export const StatusBar: React.FC<StatusBarProps> = ({ tone, label }) => {
  const background = tints[tone];
  const accent = tintAccents[tone];
  // Only `attention` has a dark variant today; the others fall through to their
  // light tint, which is the honest state rather than a guessed colour.
  const darkClass = tone === 'attention' ? ' dc-status-attention' : '';

  return (
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
            <td
              className={`dc-status${darkClass}`}
              bgcolor={background}
              style={{
                ...styles.statusCellBase,
                backgroundColor: background,
                borderLeft: `4px solid ${accent}`,
              }}
            >
              {label}
            </td>
          </tr>
        </tbody>
      </table>
    
  );
};

export default StatusBar;
