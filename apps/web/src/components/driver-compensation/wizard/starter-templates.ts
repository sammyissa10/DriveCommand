export type StarterTemplate = {
  id: string;
  label: string;
  description: string;
  payType: 'CPM' | 'HOURLY' | 'FLAT_PER_LOAD' | 'PERCENTAGE' | 'DAILY' | 'SALARY';
  rateUnit: 'PER_MILE' | 'PER_HOUR' | 'PER_LOAD' | 'PERCENTAGE' | 'PER_DAY' | 'ANNUAL';
  baseRate: string;
  overtimeEligible: boolean;
  overtimeThresholdHours?: string;
  overtimeMultiplier?: string;
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'standard-otr-cpm',
    label: 'Standard OTR CPM',
    description: 'Cost per mile for long-haul over-the-road drivers',
    payType: 'CPM',
    rateUnit: 'PER_MILE',
    baseRate: '0.55',
    overtimeEligible: true,
    overtimeThresholdHours: '40',
    overtimeMultiplier: '1.5',
  },
  {
    id: 'local-hourly',
    label: 'Local Hourly',
    description: 'Hourly rate for local or regional drivers',
    payType: 'HOURLY',
    rateUnit: 'PER_HOUR',
    baseRate: '25',
    overtimeEligible: true,
    overtimeThresholdHours: '40',
    overtimeMultiplier: '1.5',
  },
  {
    id: 'hotshot-flat',
    label: 'Hotshot Flat',
    description: 'Flat rate per load for hotshot / expedited freight',
    payType: 'FLAT_PER_LOAD',
    rateUnit: 'PER_LOAD',
    baseRate: '300',
    overtimeEligible: false,
  },
  {
    id: 'owner-op-80',
    label: 'Owner-Operator 80%',
    description: '80% of gross load revenue for owner-operators',
    payType: 'PERCENTAGE',
    rateUnit: 'PERCENTAGE',
    baseRate: '0.80',
    overtimeEligible: false,
  },
  {
    id: 'dedicated-salary',
    label: 'Dedicated Salary',
    description: 'Annual salary for dedicated route drivers',
    payType: 'SALARY',
    rateUnit: 'ANNUAL',
    baseRate: '65000',
    overtimeEligible: false,
  },
];
