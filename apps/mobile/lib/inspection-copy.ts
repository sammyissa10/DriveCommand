/**
 * Every inspection sentence that contains a count.
 *
 * Same rule and same reason as `template-copy.ts`: quick-517 shipped
 * `<p>{n} stop{n===1?'':'s'} will take …</p>` — four children, three of them
 * whitespace-sensitive — and it rendered "4 stopswill" on screen across two
 * investigations that both blamed JSX trimming and were both wrong. One string
 * per sentence removes the boundary rather than the suspect.
 *
 * The gate's own messages come from the server (`InspectionGateView.message`),
 * built by `inspection-handlers.ts`'s `inspectionCopy`. These are the ones the
 * checklist screen owns, which the server never sees.
 */

export const inspectionCopy = {
  sectionProgress: (current: number, total: number): string =>
    `Section ${current} of ${total}`,

  itemsRemaining: (n: number): string =>
    n === 1 ? '1 item left in this section' : `${n} items left in this section`,

  sectionComplete: 'Section complete',

  reviewTitle: 'Review before you sign',

  reviewSummary: (passed: number, failed: number, na: number): string => {
    const parts: string[] = [`${passed} passed`]
    if (failed > 0) parts.push(failed === 1 ? '1 failed' : `${failed} failed`)
    if (na > 0) parts.push(`${na} not applicable`)
    return parts.join(' · ')
  },

  unanswered: (n: number): string =>
    n === 1
      ? 'One item still needs an answer before you can sign.'
      : `${n} items still need an answer before you can sign.`,

  noteRequired: (min: number): string =>
    `Describe the problem in at least ${min} characters. Your dispatcher sees this.`,

  photoOffered: (used: number, max: number): string =>
    used === 0
      ? `Add a photo if it helps — up to ${max}.`
      : used === 1
        ? `1 photo attached. You can add ${max - used} more.`
        : `${used} photos attached.`,

  photoUploadedNow:
    'Photos upload as soon as you take them, so nothing is lost if you lose signal.',

  photoOfflineWarning:
    'No connection, so the photo could not be uploaded. You can still submit this with a note.',

  blockedTitle: 'This trip cannot start',

  blockedDispatchTold: 'Your dispatcher has been notified and can clear this.',

  signedConfirmation: (truck: string): string =>
    `Inspection recorded for ${truck}.`,
} as const;
