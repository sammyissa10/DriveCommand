/**
 * Footer — brand line, postal address, preferences and support links.
 *
 * TWO THINGS ARE OMITTED RATHER THAN FAKED, and both were live defects in the
 * shell this replaces:
 *
 *   1. The address renders only when EMAIL_FOOTER_ADDRESS is set. The previous
 *      shell had a `footerAddress` prop that no caller ever passed, so the line
 *      was dead code that read as though the requirement had been met.
 *
 *   2. The preferences link renders only when `preferencesUrl` is supplied. A
 *      dead "Notification preferences" href is worse than no link: it is a
 *      promise the recipient can act on and be let down by, which is the exact
 *      class of defect quick-548/549 spent two tasks removing from the driver
 *      screens.
 *
 * `process.env.EMAIL_FOOTER_ADDRESS` is read at render time on the server. This
 * component is only ever rendered server-side (by @react-email/render inside
 * the dispatcher), so there is no client bundle to leak it into — and it is not
 * NEXT_PUBLIC_*, so Next would not inline it into one anyway.
 */

import * as React from 'react';
import { colors, styles } from './tokens';

const SUPPORT_MAILTO = 'mailto:team@drivecommand.io';

export type FooterProps = {
  /**
   * Absolute URL to the recipient's notification-preferences screen. Omitted
   * entirely when absent — never rendered as a dead link.
   */
  preferencesUrl?: string;
};

export const Footer: React.FC<FooterProps> = ({ preferencesUrl }) => {
  const address = process.env.EMAIL_FOOTER_ADDRESS;

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
              bgcolor={colors.bone}
              className="dc-dark-footer"
              style={styles.footerCell}
            >
              <p className="dc-dark-muted" style={styles.footerText}>
                DriveCommand — You run the trucks. We run the rest.
              </p>

              {address ? (
                <p className="dc-dark-muted" style={styles.footerText}>
                  {address}
                </p>
              ) : null}

              <p className="dc-dark-muted" style={{ ...styles.footerText, marginBottom: 0 }}>
                {preferencesUrl ? (
                  <>
                    <a
                      href={preferencesUrl}
                      className="dc-dark-muted"
                      style={styles.footerLink}
                    >
                      Notification preferences
                    </a>
                    {' · '}
                  </>
                ) : null}
                <a href={SUPPORT_MAILTO} className="dc-dark-muted" style={styles.footerLink}>
                  Support
                </a>
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    
  );
};

export default Footer;
