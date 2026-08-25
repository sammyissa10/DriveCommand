/**
 * Document Import Phase 10 — the two Import triggers of Section 13.
 *
 * Audience for both is the UPLOADER, not subscribers: Section 13's row reads
 * "Import needs review · failed | Uploader | In-app (+email on fail)". So both
 * use `{ type: 'related', payloadKey: 'uploaderUserId' }` — the person who
 * uploaded the file is the person waiting on it, and telling a general
 * subscriber list about somebody else's half-read manifest is noise.
 *
 * `uploaderUserId` is a `User.id`. `DocumentImport` stores it as `uploadedById`;
 * the emit site resolves it and passes it under this key, which is the name the
 * recipient rule reads.
 *
 * Neither sets `pushEnabled` — Section 13 names no push channel for either, so
 * both take the column's `false` default. That is the same silence the 37
 * pre-existing templates rely on and it is deliberate here too: an import that
 * needs review is a desk task, not something worth waking a phone for.
 */

import { NotificationCategory } from '../../../src/generated/prisma';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

const APP = 'https://app.drivecommand.com';

export const importTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'import.needs_review',
    category: NotificationCategory.IMPORT,
    displayName: 'Import Needs Review',
    description:
      'Sent to the person who uploaded a document when extraction finishes and the import is ready to review. In-app.',
    defaultSubject: '{{fileName}} is ready to review',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Import ready to review',
      paragraphTextWithVars:
        '{{fileName}} has been read. {{stopCount}} stops for {{clientName}}. Review the stops and commit when it looks right.',
      ctaLabel: 'Review import',
      ctaUrl: `${APP}/carrier/imports/{{importId}}`,
    }),
    availableVariables: [
      { name: 'uploaderUserId', description: 'User id of the person who uploaded the file', sampleValue: '8f2c…' },
      { name: 'importId', description: 'Internal import id', sampleValue: 'imp_abc' },
      { name: 'fileName', description: 'Uploaded file name', sampleValue: 'manifest-0826.pdf' },
      { name: 'stopCount', description: 'Stops found in the document', sampleValue: '12' },
      { name: 'clientName', description: 'Resolved client, or "Unresolved"', sampleValue: 'Boucher Automotive' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'uploaderUserId' }],
    isActive: true,
    inAppEnabled: true,
  },

  {
    triggerKey: 'import.failed',
    category: NotificationCategory.IMPORT,
    displayName: 'Import Failed',
    description:
      'Sent to the person who uploaded a document when extraction or commit fails. In-app and email — Section 13 adds email on failure specifically, because a failed import is the one an uploader will otherwise never come back to.',
    defaultSubject: '{{fileName}} could not be imported',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Import failed',
      paragraphTextWithVars:
        '{{fileName}} could not be imported. {{failureReason}} Nothing was created. You can retry the import or fix the document and upload it again.',
      ctaLabel: 'Open import',
      ctaUrl: `${APP}/carrier/imports/{{importId}}`,
    }),
    availableVariables: [
      { name: 'uploaderUserId', description: 'User id of the person who uploaded the file', sampleValue: '8f2c…' },
      { name: 'importId', description: 'Internal import id', sampleValue: 'imp_abc' },
      { name: 'fileName', description: 'Uploaded file name', sampleValue: 'manifest-0826.pdf' },
      {
        name: 'failureReason',
        description: 'The failure message already shown on the import, verbatim',
        sampleValue: 'A document on this import belongs to another tenant and was refused.',
      },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'uploaderUserId' }],
    isActive: true,
    inAppEnabled: true,
  },
];
