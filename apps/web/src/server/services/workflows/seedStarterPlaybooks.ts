import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma';

type TxClient = Prisma.TransactionClient;

/**
 * Creates the CDL Driver Onboarding playbook with 5 steps.
 * entityType=DRIVER, category=ONBOARDING, playbookPhase=PRE_START
 */
async function createCDLDriverOnboarding(tx: TxClient, tenantId: string): Promise<void> {
  // Create StepTemplates for CDL Driver Onboarding
  const uploadCDL = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Upload CDL License',
      description: 'Driver must upload a current Commercial Driver License (CDL).',
      stepType: 'DOCUMENT_UPLOAD',
      assigneeRole: 'DRIVER',
      defaultConfig: { required: true },
    },
  });

  const uploadMedical = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Upload Medical Certificate',
      description: 'Driver must upload a valid DOT Medical Examiner Certificate.',
      stepType: 'DOCUMENT_UPLOAD',
      assigneeRole: 'DRIVER',
      defaultConfig: { required: true },
    },
  });

  const emergencyContact = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Emergency Contact Information',
      description: 'Collect emergency contact details for the driver.',
      stepType: 'FORM_FILL',
      assigneeRole: 'DRIVER',
      defaultConfig: {
        fields: [
          { key: 'name', label: 'Full Name', type: 'text', required: true },
          { key: 'phone', label: 'Phone Number', type: 'text', required: true },
          { key: 'relationship', label: 'Relationship', type: 'text', required: true },
        ],
      },
    },
  });

  const signEmployment = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Sign Employment Agreement',
      description: 'Driver must sign the employment agreement before starting.',
      stepType: 'SIGNATURE',
      assigneeRole: 'DRIVER',
      defaultConfig: { required: true },
    },
  });

  const safetyAck = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Safety Policy Acknowledgement',
      description: 'Driver must review and acknowledge the company safety policy.',
      stepType: 'TRAINING_ACK',
      assigneeRole: 'DRIVER',
      defaultConfig: { required: true, docUrl: '' },
    },
  });

  // Create the Playbook
  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'CDL Driver Onboarding',
      description: 'Standard onboarding checklist for new CDL drivers before their first dispatch.',
      entityType: 'DRIVER',
      category: 'ONBOARDING',
      playbookPhase: 'PRE_START',
    },
  });

  // Create PlaybookSteps in sequence
  await tx.playbookStep.createMany({
    data: [
      { playbookId: playbook.id, stepTemplateId: uploadCDL.id, sequence: 1, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: uploadMedical.id, sequence: 2, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: emergencyContact.id, sequence: 3, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: signEmployment.id, sequence: 4, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: safetyAck.id, sequence: 5, playbookPhase: 'PRE_START' },
    ],
  });
}

/**
 * Creates the Pre-Trip Inspection playbook with 5 steps.
 * entityType=VEHICLE, category=SAFETY, playbookPhase=NONE
 */
async function createPreTripInspection(tx: TxClient, tenantId: string): Promise<void> {
  const checkTires = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Check tire pressure and tread',
      description: 'Inspect all tires for correct pressure and adequate tread depth.',
      stepType: 'INSPECTION_ITEM',
      assigneeRole: 'DRIVER',
      defaultConfig: { require_photo_on_fail: true },
    },
  });

  const checkBrakes = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Check brakes and brake lights',
      description: 'Test brake function and confirm brake lights are operational.',
      stepType: 'INSPECTION_ITEM',
      assigneeRole: 'DRIVER',
      defaultConfig: { require_photo_on_fail: true },
    },
  });

  const checkLights = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Check headlights, tail lights, turn signals',
      description: 'Verify all exterior lights are working correctly.',
      stepType: 'INSPECTION_ITEM',
      assigneeRole: 'DRIVER',
      defaultConfig: { require_photo_on_fail: true },
    },
  });

  const checkFluids = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Check fluid levels (oil, coolant, washer fluid)',
      description: 'Check and top off engine oil, coolant, and windshield washer fluid.',
      stepType: 'INSPECTION_ITEM',
      assigneeRole: 'DRIVER',
      defaultConfig: { require_photo_on_fail: false },
    },
  });

  const checkCargo = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Inspect cargo securement',
      description: 'Verify cargo is properly secured and load does not exceed limits.',
      stepType: 'INSPECTION_ITEM',
      assigneeRole: 'DRIVER',
      defaultConfig: { require_photo_on_fail: true },
    },
  });

  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'Pre-Trip Inspection',
      description: 'Required vehicle inspection checklist before every dispatch.',
      entityType: 'VEHICLE',
      category: 'SAFETY',
      playbookPhase: 'NONE',
    },
  });

  await tx.playbookStep.createMany({
    data: [
      { playbookId: playbook.id, stepTemplateId: checkTires.id, sequence: 1, playbookPhase: 'NONE' },
      { playbookId: playbook.id, stepTemplateId: checkBrakes.id, sequence: 2, playbookPhase: 'NONE' },
      { playbookId: playbook.id, stepTemplateId: checkLights.id, sequence: 3, playbookPhase: 'NONE' },
      { playbookId: playbook.id, stepTemplateId: checkFluids.id, sequence: 4, playbookPhase: 'NONE' },
      { playbookId: playbook.id, stepTemplateId: checkCargo.id, sequence: 5, playbookPhase: 'NONE' },
    ],
  });
}

/**
 * Creates the New Partner Setup playbook with 4 steps.
 * entityType=PARTNER, category=PARTNER, playbookPhase=PRE_START
 */
async function createNewPartnerSetup(tx: TxClient, tenantId: string): Promise<void> {
  const uploadW9 = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Upload W-9 Tax Form',
      description: 'Collect the partner W-9 for tax reporting purposes.',
      stepType: 'DOCUMENT_UPLOAD',
      assigneeRole: 'DISPATCHER',
      defaultConfig: {},
    },
  });

  const uploadCOI = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Upload Certificate of Insurance',
      description: 'Verify partner carries adequate cargo and liability insurance.',
      stepType: 'DOCUMENT_UPLOAD',
      assigneeRole: 'DISPATCHER',
      defaultConfig: {},
    },
  });

  const billingDetails = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Contact & Billing Details',
      description: 'Collect primary contact and billing address information.',
      stepType: 'FORM_FILL',
      assigneeRole: 'DISPATCHER',
      defaultConfig: {
        fields: [
          { key: 'contactName', label: 'Contact Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'text', required: true },
          { key: 'phone', label: 'Phone', type: 'text', required: true },
          { key: 'billingAddress', label: 'Billing Address', type: 'text', required: true },
        ],
      },
    },
  });

  const financeApproval = await tx.stepTemplate.create({
    data: {
      tenantId,
      name: 'Finance approval',
      description: 'Safety Manager reviews and approves the new partner before activation.',
      stepType: 'APPROVAL',
      assigneeRole: 'SAFETY_MANAGER',
      defaultConfig: {},
    },
  });

  const playbook = await tx.playbook.create({
    data: {
      tenantId,
      name: 'New Partner Setup',
      description: 'Onboarding checklist for setting up a new carrier or broker partner.',
      entityType: 'PARTNER',
      category: 'PARTNER',
      playbookPhase: 'PRE_START',
    },
  });

  await tx.playbookStep.createMany({
    data: [
      { playbookId: playbook.id, stepTemplateId: uploadW9.id, sequence: 1, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: uploadCOI.id, sequence: 2, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: billingDetails.id, sequence: 3, playbookPhase: 'PRE_START' },
      { playbookId: playbook.id, stepTemplateId: financeApproval.id, sequence: 4, playbookPhase: 'PRE_START' },
    ],
  });
}

/**
 * Seeds the 3 starter Playbooks for a given tenant.
 *
 * Idempotent: if 'CDL Driver Onboarding' already exists for this tenant, returns immediately.
 * All creation is wrapped in a single transaction so partial failures are rolled back.
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
    await createNewPartnerSetup(tx, tenantId);
  });
}
