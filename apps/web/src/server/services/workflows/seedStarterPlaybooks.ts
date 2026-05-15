import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma';

type TxClient = Prisma.TransactionClient;

/**
 * Creates the CDL Driver Onboarding playbook with 9 steps (spec Section 12, Starter 1).
 * entityType=DRIVER, category=ONBOARDING
 */
async function createCDLDriverOnboarding(tx: TxClient, tenantId: string): Promise<void> {
  const [
    uploadLicense,
    uploadMedical,
    drugTest,
    applicationForm,
    fmcsaQuery,
    mvrCheck,
    safetyAck,
    eldTraining,
    driverSignature,
  ] = await Promise.all([
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: "Upload Driver's License",
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Upload Medical Certificate',
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Pre-Employment Drug Test',
        stepType: 'THIRD_PARTY',
        assigneeRole: 'SAFETY_MANAGER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Driver Application Form',
        stepType: 'FORM_FILL',
        assigneeRole: 'DRIVER',
        defaultConfig: {
          fields: [
            { key: 'fullName', label: 'Full Name', type: 'text', required: true },
            { key: 'address', label: 'Address', type: 'text', required: true },
            { key: 'cdlNumber', label: 'CDL Number', type: 'text', required: true },
            { key: 'cdlExpiry', label: 'CDL Expiry', type: 'date', required: true },
            { key: 'cdlState', label: 'CDL State', type: 'text', required: true },
            { key: 'endorsements', label: 'Endorsements', type: 'text', required: false },
          ],
        },
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'FMCSA Clearinghouse Query',
        stepType: 'THIRD_PARTY',
        assigneeRole: 'SAFETY_MANAGER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Motor Vehicle Record (MVR)',
        stepType: 'THIRD_PARTY',
        assigneeRole: 'SAFETY_MANAGER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Safety Policy Acknowledgment',
        stepType: 'TRAINING_ACK',
        assigneeRole: 'DRIVER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'ELD Training Completion',
        stepType: 'TRAINING_ACK',
        assigneeRole: 'DRIVER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Driver Signature',
        stepType: 'SIGNATURE',
        assigneeRole: 'DRIVER',
        defaultConfig: {},
      },
    }),
  ]);

  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'CDL Driver Onboarding',
      description: 'Standard onboarding checklist for new CDL drivers before their first dispatch.',
      entityType: 'DRIVER',
      category: 'ONBOARDING',
    },
  });

  await tx.playbookStep.createMany({
    data: [
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: uploadLicense.id,
        sequence: 1,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: uploadMedical.id,
        sequence: 2,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: drugTest.id,
        sequence: 3,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: applicationForm.id,
        sequence: 4,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: fmcsaQuery.id,
        sequence: 5,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
        dueDaysFromStart: 3,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: mvrCheck.id,
        sequence: 6,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
        dueDaysFromStart: 3,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: safetyAck.id,
        sequence: 7,
        playbookPhase: 'DAY_1',
        isDispatchBlocker: false,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: eldTraining.id,
        sequence: 8,
        playbookPhase: 'WEEK_1',
        isDispatchBlocker: false,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: driverSignature.id,
        sequence: 9,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
    ],
  });
}

/**
 * Creates the Pre-Trip Inspection (DVIR) playbook with 12 steps (spec Section 12, Starter 2).
 * entityType=DISPATCH, category=VEHICLE_INSPECTION
 */
async function createPreTripInspection(tx: TxClient, tenantId: string): Promise<void> {
  const inspectionItems: Array<{ name: string; description: string }> = [
    {
      name: 'Front Brakes',
      description: 'Press pedal firmly. Check for resistance and unusual sounds.',
    },
    {
      name: 'Rear Brakes',
      description: 'Check brake lines for leaks. Test parking brake.',
    },
    {
      name: 'Tires & Wheels',
      description: 'Check tread depth, inflation, and sidewall condition on all tires.',
    },
    {
      name: 'Lights',
      description: 'Verify headlights, brake lights, turn signals, and clearance lamps.',
    },
    {
      name: 'Mirrors',
      description: 'Confirm all mirrors are clean, undamaged, and properly adjusted.',
    },
    {
      name: 'Windshield & Wipers',
      description: 'Check for cracks. Test wiper operation and washer fluid.',
    },
    {
      name: 'Horn',
      description: 'Test horn operation.',
    },
    {
      name: 'Fuel Level',
      description: 'Confirm adequate fuel for the route.',
    },
    {
      name: 'Engine Compartment',
      description: 'Check oil, coolant, belts, and hoses for leaks or damage.',
    },
    {
      name: 'Coupling Devices',
      description: 'Inspect fifth wheel or hitch. Confirm trailer connection if applicable.',
    },
    {
      name: 'Emergency Equipment',
      description: 'Confirm reflectors, fire extinguisher, and first aid kit are present.',
    },
  ];

  const inspectionTemplates = await Promise.all(
    inspectionItems.map((item) =>
      tx.stepTemplate.create({
        data: {
          tenantId,
          name: item.name,
          description: item.description,
          stepType: 'INSPECTION_ITEM',
          assigneeRole: 'DRIVER',
          defaultConfig: { requiresPhotoOnFail: true },
        },
      })
    )
  );

  const signatureTemplate = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Driver Signature',
      stepType: 'SIGNATURE',
      assigneeRole: 'DRIVER',
      defaultConfig: {},
    },
  });

  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'Pre-Trip Inspection (DVIR)',
      description: 'Required vehicle inspection checklist before every dispatch.',
      entityType: 'DISPATCH',
      category: 'VEHICLE_INSPECTION',
    },
  });

  const stepData = [
    ...inspectionTemplates.map((t, i) => ({
      tenantId,
      playbookId: playbook.id,
      stepTemplateId: t.id,
      sequence: i + 1,
      playbookPhase: 'NONE' as const,
      isDispatchBlocker: true,
    })),
    {
      tenantId,
      playbookId: playbook.id,
      stepTemplateId: signatureTemplate.id,
      sequence: 12,
      playbookPhase: 'NONE' as const,
      isDispatchBlocker: true,
    },
  ];

  await tx.playbookStep.createMany({ data: stepData });
}

/**
 * Creates the New Partner Setup playbook with 6 steps (spec Section 12, Starter 3).
 * entityType=PARTNER, category=PARTNER
 */
async function createPartnerSetup(tx: TxClient, tenantId: string): Promise<void> {
  const [
    uploadW9,
    uploadCOI,
    uploadLetterOfAuthority,
    brokerAgreement,
    paymentTerms,
    partnerApproval,
  ] = await Promise.all([
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Upload W-9',
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Upload Certificate of Insurance',
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Upload Letter of Authority',
        stepType: 'DOCUMENT_UPLOAD',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Broker-Carrier Agreement',
        stepType: 'SIGNATURE',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Payment Terms Confirmation',
        stepType: 'FORM_FILL',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {
          fields: [
            { key: 'paymentTerms', label: 'Payment Terms', type: 'text', required: true },
            { key: 'factoringCompany', label: 'Factoring Company', type: 'text', required: false },
            { key: 'noaOnFile', label: 'NOA on File', type: 'boolean', required: true },
          ],
        },
      },
    }),
    tx.stepTemplate.create({
      data: {
        tenantId,
        name: 'Partner Approval',
        stepType: 'APPROVAL',
        assigneeRole: 'DISPATCHER',
        defaultConfig: {},
      },
    }),
  ]);

  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'New Partner Setup',
      description: 'Carrier packet checklist for onboarding a new carrier or broker partner.',
      entityType: 'PARTNER',
      category: 'PARTNER',
    },
  });

  await tx.playbookStep.createMany({
    data: [
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: uploadW9.id,
        sequence: 1,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: uploadCOI.id,
        sequence: 2,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: uploadLetterOfAuthority.id,
        sequence: 3,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: brokerAgreement.id,
        sequence: 4,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: paymentTerms.id,
        sequence: 5,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: false,
      },
      {
        tenantId,
        playbookId: playbook.id,
        stepTemplateId: partnerApproval.id,
        sequence: 6,
        playbookPhase: 'PRE_START',
        isDispatchBlocker: true,
      },
    ],
  });
}

/**
 * Seeds the 3 starter Playbooks for a given tenant (spec Section 12).
 *
 * Idempotent: if 'CDL Driver Onboarding' already exists for this tenant, returns immediately.
 * All creation is wrapped in a single transaction so partial failures are rolled back.
 *
 * Step counts: CDL Driver Onboarding (9), Pre-Trip Inspection DVIR (12), New Partner Setup (6).
 *
 * @param tenantId - The UUID of the tenant to seed.
 */
export async function seedStarterPlaybooks(tenantId: string): Promise<void> {
  // Idempotency check — 'CDL Driver Onboarding' is the sentinel
  const existing = await prisma.playbook.findFirst({
    where: { tenantId, name: 'CDL Driver Onboarding' },
    select: { id: true },
  });

  if (existing) {
    return; // Already seeded — skip
  }

  await prisma.$transaction(async (tx) => {
    await createCDLDriverOnboarding(tx, tenantId);
    await createPreTripInspection(tx, tenantId);
    await createPartnerSetup(tx, tenantId);
  });
}
