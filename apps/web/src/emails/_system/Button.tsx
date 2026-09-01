/**
 * Button — bulletproof CTA.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS COMPONENT EMITS A RAW HTML STRING
 * ---------------------------------------------------------------------------
 * A bulletproof button needs Microsoft conditional comments:
 *
 *     <!--[if mso]>   …VML roundrect…      <![endif]-->
 *     <!--[if !mso]><!-->  …normal table…  <!--<![endif]-->
 *
 * JSX cannot emit an HTML comment — `{/* … *\/}` is a JavaScript comment and
 * produces nothing in the output — so the two halves cannot be gated from JSX
 * and Outlook would render BOTH buttons, one above the other. Building this one
 * leaf as a string is the honest way to get the comments out.
 *
 * The values are still tokens: every colour and measurement below is
 * interpolated from `tokens.ts`, so this file contains no brand literal. Both
 * inputs are escaped — `href` as an attribute, `label` as text — because a
 * template variable can reach them.
 *
 * Outlook ignores `border-radius`, which is the entire reason the VML
 * `v:roundrect` exists: without it the button renders as a hard rectangle
 * there. `<w:anchorlock/>` stops Word turning the whole shape into a text
 * selection instead of a link.
 *
 * ---------------------------------------------------------------------------
 * THE URL LINE UNDER THE BUTTON IS NOT DECORATION
 * ---------------------------------------------------------------------------
 * With images blocked the button still renders (it is a background colour, not
 * an image), but in a text-only client, an aggressive corporate gateway, or a
 * plain-text conversion, a bare "Open trip" is a dead end. Printing the
 * destination underneath means the recipient can always reach it.
 */

import * as React from 'react';
import {
  colors,
  fonts,
  fontSizes,
  lineHeights,
  metrics,
  space,
  styles,
} from './tokens';

export type ButtonProps = {
  href: string;
  label: string;
};

/** Escape for an HTML attribute value inside double quotes. */
function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape for HTML text content. */
function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 14px vertical padding + a 22px line box = 50px, clearing the 44px tap floor.
 * VML needs the height as a number, so it is computed rather than restated.
 */
const VML_HEIGHT = metrics.minTapHeight + 6;
const VML_WIDTH = 220;

export function buildButtonHtml(href: string, label: string): string {
  const h = escAttr(href);
  const t = escText(label);

  const vml = [
    '<!--[if mso]>',
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"`,
    ` href="${h}" style="height:${VML_HEIGHT}px;v-text-anchor:middle;width:${VML_WIDTH}px;"`,
    ` arcsize="12%" stroke="f" fillcolor="${colors.signalBlue}">`,
    '<w:anchorlock/>',
    `<center style="color:${colors.white};font-family:${fonts.headingStack};font-size:${fontSizes.button};font-weight:600;">`,
    t,
    '</center>',
    '</v:roundrect>',
    '<![endif]-->',
  ].join('');

  const cellStyle = [
    `background-color:${colors.signalBlue}`,
    `border-radius:${metrics.buttonRadius}`,
    'text-align:center',
    'padding:14px 28px',
  ].join(';');

  const linkStyle = [
    `font-family:${fonts.headingStack}`,
    `font-size:${fontSizes.button}`,
    'font-weight:600',
    `color:${colors.white}`,
    'text-decoration:none',
    'display:inline-block',
    'line-height:22px',
  ].join(';');

  const standard = [
    '<!--[if !mso]><!-->',
    '<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">',
    '<tbody><tr>',
    `<td bgcolor="${colors.signalBlue}" style="${cellStyle}">`,
    `<a class="dc-btn" href="${h}" target="_blank" style="${linkStyle}">${t}</a>`,
    '</td>',
    '</tr></tbody></table>',
    '<!--<![endif]-->',
  ].join('');

  return vml + standard;
}

/**
 * The full CTA block as an HTML string: the bulletproof button plus the
 * plain-text URL line beneath it.
 *
 * Exported because `body-html-transform.ts` upgrades a bare <a> in cached
 * Tiptap HTML into this exact markup. Two sources of truth for the CTA would
 * drift the moment either is restyled, so the transform calls this rather than
 * carrying its own copy.
 */
export function buildButtonBlockHtml(href: string, label: string): string {
  const urlNoteStyle = [
    `font-family:${fonts.bodyStack}`,
    `font-size:${fontSizes.fine}`,
    `line-height:${lineHeights.fine}`,
    `color:${colors.textSecondary}`,
    `margin:${space[3]} 0 0 0`,
    'word-break:break-all',
  ].join(';');

  return [
    `<div style="margin:${space[6]} 0 0 0">`,
    `<div>${buildButtonHtml(href, label)}</div>`,
    `<p class="dc-dark-muted" style="${urlNoteStyle}">${escText(href)}</p>`,
    '</div>',
  ].join('');
}

export const Button: React.FC<ButtonProps> = ({ href, label }) => (
  <div style={{ margin: `${space[6]} 0 0 0` }}>
    <div dangerouslySetInnerHTML={{ __html: buildButtonHtml(href, label) }} />
    <p className="dc-dark-muted" style={styles.buttonUrlNote}>
      {href}
    </p>
  </div>
);

export default Button;
