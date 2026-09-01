/**
 * Shell — the outer document every dispatcher email renders inside.
 *
 * ===========================================================================
 * HOW THE DARK-MODE RULES STAY CLEAR OF OUTLOOK WINDOWS
 * ===========================================================================
 * Outlook Windows renders through the Word engine, which supports NO `@media`
 * queries at all. That is not a hazard here — it is the safety property this
 * design leans on:
 *
 *   1. Every light-mode value is an INLINE style (and, on coloured cells, a
 *      `bgcolor` attribute beside it). Inline CSS is the one thing Word honours
 *      reliably, so Outlook always gets a complete, correct light email.
 *   2. Every dark-mode value lives ONLY inside `@media (prefers-color-scheme:
 *      dark)` and only overrides via `.dc-dark-*` classes. Word never evaluates
 *      the media query, so those declarations are inert there by construction —
 *      not by a check someone could drop.
 *   3. The dark rules therefore carry COLOUR ONLY. No layout, no spacing, no
 *      display property. If a client applied them unexpectedly, the worst
 *      outcome is wrong colours, never a collapsed table.
 *
 * `!important` is on the dark declarations because they must beat the inline
 * styles they are overriding — inline wins the cascade otherwise.
 *
 * ===========================================================================
 * THE BODY RESET IS THE OTHER HALF OF THE JOB
 * ===========================================================================
 * `bodyHtml` arrives from Tiptap completely unstyled: bare <h2>, <p> and <a>.
 * With no rules it inherits client defaults — Times New Roman headings at
 * browser sizes, default-blue underlined links — which is why the body reads as
 * a wall of text no matter how good the frame around it is. The `.dc-body`
 * descendant selectors below are what make the injected markup part of the
 * brand.
 *
 * Those selectors are embedded CSS, so Outlook Windows applies only the subset
 * Word understands (it does handle simple descendant selectors for colour and
 * font-family). Anything it drops falls back to the cell's own inline
 * font-family and colour, which are already correct.
 */

import * as React from 'react';
import { Body, Container, Head, Html } from '@react-email/components';
import {
  colors,
  darkColors,
  fonts,
  fontSizes,
  lineHeights,
  metrics,
  space,
  styles,
} from './tokens';
import { Header } from './Header';
import { Footer } from './Footer';
import { Preheader } from './Preheader';
import { StatusBar, type StatusBarProps } from './StatusBar';

export type ShellProps = {
  /** Inbox preview line. Required — a constant here is a wasted signal. */
  preheader: string;
  /** Tiptap-generated, already variable-substituted HTML. */
  bodyHtml: string;
  /** Optional glanceable strip under the header. */
  statusBar?: StatusBarProps;
  /** Overrides the 3px rule under the header band. */
  accentColor?: string;
  /** Absolute URL to notification preferences. Omitted if absent. */
  preferencesUrl?: string;
  /** Absolute origin for the logo asset. */
  logoBaseUrl: string;
};

const CSS = `
  /* Client resets — these are structural and must not be theme-dependent. */
  body { margin:0; padding:0; width:100% !important; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:underline; }

  /* Outlook honours this where the inline style object cannot carry it. */
  .dc-preheader { mso-hide:all; }

  /* ---------------------------------------------------------------------
     Injected body HTML. Tiptap emits bare h1/h2/p/a with no styling at all.
     --------------------------------------------------------------------- */
  .dc-body h1 {
    font-family:${fonts.headingStack};
    font-size:${fontSizes.h1};
    line-height:${lineHeights.heading};
    font-weight:700;
    color:${colors.navy};
    margin:0 0 ${space[4]} 0;
  }
  .dc-body h2 {
    font-family:${fonts.headingStack};
    font-size:${fontSizes.h2};
    line-height:${lineHeights.heading};
    font-weight:700;
    color:${colors.navy};
    margin:0 0 ${space[3]} 0;
  }
  .dc-body p {
    font-family:${fonts.bodyStack};
    font-size:${fontSizes.body};
    line-height:${lineHeights.body};
    color:${colors.textPrimary};
    margin:0 0 ${space[4]} 0;
  }
  .dc-body p:last-child { margin-bottom:0; }
  .dc-body a { color:${colors.signalBlue}; text-decoration:underline; }
  .dc-body ul, .dc-body ol {
    font-family:${fonts.bodyStack};
    font-size:${fontSizes.body};
    line-height:${lineHeights.body};
    color:${colors.textPrimary};
    margin:0 0 ${space[4]} 0;
    padding-left:${space[5]};
  }
  .dc-body strong { font-weight:600; }

  /* ---------------------------------------------------------------------
     Dark mode. COLOUR ONLY. Never evaluated by Outlook Windows.
     --------------------------------------------------------------------- */
  @media (prefers-color-scheme: dark) {
    .dc-page      { background-color:${darkColors.pageBg} !important; }
    .dc-card      { background-color:${darkColors.cardBg} !important;
                    border-color:${darkColors.border} !important; }
    .dc-dark-text { color:${darkColors.textPrimary} !important; }
    .dc-dark-muted{ color:${darkColors.textSecondary} !important; }
    .dc-dark-label{ color:${darkColors.textSecondary} !important;
                    border-color:${darkColors.border} !important; }
    .dc-dark-footer { background-color:${darkColors.cardBg} !important;
                      border-color:${darkColors.border} !important; }

    .dc-body h1, .dc-body h2 { color:${darkColors.textPrimary} !important; }
    .dc-body p, .dc-body li, .dc-body strong { color:${darkColors.textPrimary} !important; }
    .dc-body a { color:${darkColors.link} !important; }
  }
`;

export const Shell: React.FC<ShellProps> = ({
  preheader,
  bodyHtml,
  statusBar,
  accentColor,
  preferencesUrl,
  logoBaseUrl,
}) => (
  <Html lang="en">
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </Head>
    <Body className="dc-page" style={styles.pageBody}>
      <Preheader text={preheader} />

      <table
        role="presentation"
        border={0}
        cellPadding="0"
        cellSpacing="0"
        width="100%"
        className="dc-page"
        bgcolor={colors.bone}
        style={styles.pageTable}
      >
        <tbody>
          <tr>
            <td align="center" style={styles.pageCell}>
              <Container
                className="dc-card"
                style={{ ...styles.card, width: `${metrics.containerWidth}px` }}
              >
                <Header logoBaseUrl={logoBaseUrl} accentColor={accentColor} />

                {statusBar ? (
                  <StatusBar tone={statusBar.tone} label={statusBar.label} />
                ) : null}

                {/*
                  The ONE dangerouslySetInnerHTML in this file, as designed.
                  `bodyHtml` must already be Tiptap-generated and
                  variable-substituted by template-renderer.ts. Never pass raw
                  user input here.
                */}
                {/*
                  Hand-rolled table with the padding on the TD, not a <Section>.
                  React Email's Section puts the style on the <table>, and
                  padding there is dropped — measured: the body sat flush at the
                  card edge (left 51) while the footer, which does put padding on
                  its td, was correctly inset (left 83). Every other component in
                  this system already uses the td form; this one was the outlier.
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
                      <td className="dc-dark-text" style={styles.bodyCell}>
                        <div
                          className="dc-body"
                          dangerouslySetInnerHTML={{ __html: bodyHtml }}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>

                <Footer preferencesUrl={preferencesUrl} />
              </Container>
            </td>
          </tr>
        </tbody>
      </table>
    </Body>
  </Html>
);

export default Shell;
