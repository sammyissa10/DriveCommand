import * as fs from 'fs';
import * as path from 'path';

export interface PrismaField {
  name: string;
  type: string;
  isRequired: boolean;
  isArray: boolean;
  isId: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  defaultValue?: string;
  dbType?: string; // @db.Uuid, @db.Timestamptz, etc.
}

export interface PrismaRelation {
  fieldName: string;
  targetModel: string;
  isArray: boolean;
  onDelete?: string; // Cascade, SetNull, etc.
  onUpdate?: string;
  relationName?: string;
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  relations: PrismaRelation[];
  module: string; // Computed from model name/purpose
}

export interface PrismaEnum {
  name: string;
  values: string[];
}

export interface ParsedSchema {
  models: PrismaModel[];
  enums: PrismaEnum[];
}

// Module assignment based on model name patterns
const MODEL_MODULE_MAP: Record<string, string> = {
  // Auth
  User: 'Auth',
  Tenant: 'Auth',
  DriverInvitation: 'Auth',

  // Fleet
  Truck: 'Fleet',
  Driver: 'Fleet',
  GPSLocation: 'Fleet',
  SafetyEvent: 'Fleet',
  FuelRecord: 'Fleet',
  MaintenanceEvent: 'Fleet',
  ScheduledService: 'Fleet',

  // Dispatch
  Route: 'Dispatch',
  RouteStop: 'Dispatch',
  RouteDriver: 'Dispatch',
  DriverRouteJoin: 'Dispatch',
  Load: 'Dispatch',
  RouteTemplate: 'Dispatch',

  // Finance
  Invoice: 'Finance',
  InvoiceItem: 'Finance',
  RouteExpense: 'Finance',
  RoutePayment: 'Finance',
  PayrollRecord: 'Finance',
  ExpenseCategory: 'Finance',
  ExpenseTemplate: 'Finance',
  ExpenseTemplateItem: 'Finance',

  // Compliance
  Document: 'Compliance',

  // CRM
  Customer: 'CRM',
  CustomerInteraction: 'CRM',
  Tag: 'CRM',
  TagAssignment: 'CRM',

  // Support
  SupportTicket: 'Support',
  TicketMessage: 'Support',

  // Integrations
  TenantIntegration: 'Integrations',
  PushToken: 'Integrations',

  // Notifications
  NotificationLog: 'Notifications',
  InAppNotification: 'Notifications',

  // Carrier Ops
  CarrierClient: 'Carrier Ops',
  CarrierContract: 'Carrier Ops',
  CarrierFacility: 'Carrier Ops',
  CarrierDriver: 'Carrier Ops',
  CarrierTruck: 'Carrier Ops',
  CarrierDispatch: 'Carrier Ops',
  CarrierLoad: 'Carrier Ops',
  CarrierExpense: 'Carrier Ops',
  DriverPayRecord: 'Carrier Ops',
  DriverCompensationTemplate: 'Carrier Ops',
  CarrierDocumentType: 'Carrier Ops',

  // Workflow
  StepTemplate: 'Workflow',
  Playbook: 'Workflow',
  PlaybookInstance: 'Workflow',
  PlaybookNotification: 'Workflow',
  PlaybookTrigger: 'Workflow',
  DispatchOverrideAudit: 'Workflow',

  // Billing
  Subscription: 'Billing',
  ActivationProgress: 'Billing',
  SysAdminInvoice: 'Billing',

  // Analytics
  AutomationRule: 'Analytics',
  AutomationRun: 'Analytics',
  AppEvent: 'Analytics',
  TenantMetricsDaily: 'Analytics',
  TenantHealthScore: 'Analytics',

  // HOS/Incidents
  DriverHOSEntry: 'HOS/Incidents',
  DriverIncident: 'HOS/Incidents',

  // Fleet Messages
  FleetMessage: 'Messaging',
};

function assignModule(modelName: string): string {
  return MODEL_MODULE_MAP[modelName] || 'Other';
}

function parseField(fieldLine: string): PrismaField | PrismaRelation | null {
  const trimmed = fieldLine.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;

  // Parse field line: fieldName Type modifier? @attributes?
  const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\??/);
  if (!fieldMatch) return null;

  const [, name, type, arrayModifier] = fieldMatch;
  const isArray = !!arrayModifier;
  const isRequired = !trimmed.includes('?');

  // Check if this is a relation field (references another model - capitalized type)
  const isRelation = /^[A-Z]/.test(type);

  if (isRelation) {
    // Parse relation attributes
    const relationMatch = trimmed.match(/@relation\((.*?)\)/);
    let onDelete: string | undefined;
    let onUpdate: string | undefined;
    let relationName: string | undefined;

    if (relationMatch) {
      const attrs = relationMatch[1];
      const onDeleteMatch = attrs.match(/onDelete:\s*(\w+)/);
      const onUpdateMatch = attrs.match(/onUpdate:\s*(\w+)/);
      const nameMatch = attrs.match(/name:\s*"([^"]+)"/);

      if (onDeleteMatch) onDelete = onDeleteMatch[1];
      if (onUpdateMatch) onUpdate = onUpdateMatch[1];
      if (nameMatch) relationName = nameMatch[1];
    }

    return {
      fieldName: name,
      targetModel: type,
      isArray,
      onDelete,
      onUpdate,
      relationName,
    } as PrismaRelation;
  }

  // Regular field
  const isId = trimmed.includes('@id');
  const isUnique = trimmed.includes('@unique');
  const hasDefault = trimmed.includes('@default');

  let defaultValue: string | undefined;
  if (hasDefault) {
    const defaultMatch = trimmed.match(/@default\((.*?)\)/);
    if (defaultMatch) {
      defaultValue = defaultMatch[1];
    }
  }

  let dbType: string | undefined;
  const dbMatch = trimmed.match(/@db\.(\w+)/);
  if (dbMatch) {
    dbType = `@db.${dbMatch[1]}`;
  }

  return {
    name,
    type,
    isRequired,
    isArray,
    isId,
    isUnique,
    hasDefault,
    defaultValue,
    dbType,
  } as PrismaField;
}

function parseModel(modelBlock: string, modelName: string): PrismaModel {
  const lines = modelBlock.split('\n');
  const fields: PrismaField[] = [];
  const relations: PrismaRelation[] = [];

  for (const line of lines) {
    const parsed = parseField(line);
    if (!parsed) continue;

    if ('targetModel' in parsed) {
      relations.push(parsed);
    } else {
      fields.push(parsed);
    }
  }

  return {
    name: modelName,
    fields,
    relations,
    module: assignModule(modelName),
  };
}

function parseEnum(enumBlock: string, enumName: string): PrismaEnum {
  const lines = enumBlock.split('\n');
  const values: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    values.push(trimmed);
  }

  return {
    name: enumName,
    values,
  };
}

let cachedSchema: ParsedSchema | null = null;

export function parsePrismaSchema(): ParsedSchema {
  // Return cached result if available
  if (cachedSchema) return cachedSchema;

  // Read schema.prisma from project root
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  const models: PrismaModel[] = [];
  const enums: PrismaEnum[] = [];

  // Extract all model blocks
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let modelMatch;
  while ((modelMatch = modelRegex.exec(schemaContent)) !== null) {
    const [, modelName, modelBody] = modelMatch;
    models.push(parseModel(modelBody, modelName));
  }

  // Extract all enum blocks
  const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let enumMatch;
  while ((enumMatch = enumRegex.exec(schemaContent)) !== null) {
    const [, enumName, enumBody] = enumMatch;
    enums.push(parseEnum(enumBody, enumName));
  }

  cachedSchema = { models, enums };
  return cachedSchema;
}
