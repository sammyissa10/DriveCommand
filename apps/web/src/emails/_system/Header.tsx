/**
 * Header — navy band, mark, wordmark, accent rule.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WORDMARK IS LIVE TEXT AND NOT PART OF THE IMAGE
 * ---------------------------------------------------------------------------
 * There is no wordmark IMAGE in this repository. `public/logo.png` is the mark
 * alone; `logo-horizontal.png` is that same mark with 352px of empty
 * transparent padding extended to its right (see process-logo.mjs), not a
 * lockup; and `app-logo.tsx` renders the wordmark as live text — Poppins, `D`
 * at 800 and `riveCommand` at 600. Rasterising letterforms into a new bitmap
 * would be inventing a brand asset, so this pairs the real mark with real text.
 *
 * It is also the better email decision on its own merits. Roughly a third of
 * recipients see images blocked by default, and the usual workaround — styling
 * the `alt` text to look like the wordmark — is honoured inconsistently by
 * Outlook and not at all by some webmail. Live text always renders.
 *
 * Verified rather than assumed (scripts/email-render-qa.ts, images-blocked run):
 * with images off the header still reads "DriveCommand" in white on navy. What
 * remains in the mark's place is client-dependent — Chromium draws its
 * broken-image placeholder even for alt="", so a small neutral box is visible
 * there; clients that honour empty alt render nothing. The BRAND survives
 * either way, which is the property being bought. It is not a pristine header.
 *
 * The image `src` MUST be absolute. A relative `/email/logo-2x.png` resolves
 * against the mail client's own origin and is simply broken, which is why
 * `logoBaseUrl` is threaded down from the Shell rather than hardcoded.
 */

import * as React from 'react';
import { Img } from '@react-email/components';
import { colors, metrics, space, styles } from './tokens';

export type HeaderProps = {
  /** Absolute origin for the logo asset, e.g. https://drivecommand.app */
  logoBaseUrl: string;
  /**
   * Colour of the 3px rule under the band. Defaults to Signal Blue; alert-class
   * emails pass `colors.orange` so the accent agrees with their status bar.
   */
  accentColor?: string;
};

export const Header: React.FC<HeaderProps> = ({
  logoBaseUrl,
  accentColor = colors.signalBlue,
}) => (
  <>
          {/*
        A two-cell table, not flexbox: Outlook Windows has no flex support and
        would stack these. `width="1%"` on the logo cell shrink-wraps it so the
        wordmark cell takes the remainder.
      */}
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
            <td bgcolor={colors.navy} style={styles.headerCell} width="1%">
              <Img
                src={`${logoBaseUrl}/email/logo-2x.png`}
                width={metrics.logoDisplayPx}
                height={metrics.logoDisplayPx}
                alt=""
                style={styles.logoImg}
              />
            </td>
            <td
              bgcolor={colors.navy}
              style={{ ...styles.headerCell, paddingLeft: space[3] }}
            >
              {/*
                The wordmark is the accessible name for the header, so the mark
                above carries alt="" to avoid announcing it twice.
              */}
              <span style={styles.wordmark}>DriveCommand</span>
            </td>
          </tr>
        </tbody>
      </table>
    

    {/*
      Accent rule. An empty cell with a background needs a non-breaking space and
      an explicit line-height, or Outlook collapses it to nothing.
    */}
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
            <td bgcolor={accentColor} style={{ ...styles.accentRule, backgroundColor: accentColor }}>
              &nbsp;
            </td>
          </tr>
        </tbody>
      </table>
    
  </>
);

export default Header;
