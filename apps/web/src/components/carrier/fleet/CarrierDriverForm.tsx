'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export interface CarrierDriverData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  cdlNumber: string | null;
  cdlState: string | null;
  cdlClass: string | null;
  cdlExpiry: Date | string | null;
  homeTerminalId: string | null;
  payModel: string;
  payRate: number | string | null;
  payPeriod: string;
  userId: string | null;
  status: string;
  notes: string | null;
}

export interface FacilityOption {
  id: string;
  name: string;
}

interface CarrierDriverFormProps {
  driver?: CarrierDriverData;
  facilities?: FacilityOption[];
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const PAY_RATE_LABELS: Record<string, string> = {
  per_mile: 'Rate per Mile ($)',
  percentage_gross: 'Percentage of Gross (%)',
  hourly: 'Hourly Rate ($)',
  flat_rate: 'Flat Rate ($)',
  team_split: 'Rate per Mile ($)',
};

function toDateInputValue(val: Date | string | null | undefined): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function CarrierDriverForm({ driver, facilities = [] }: CarrierDriverFormProps) {
  const router = useRouter();
  const isEdit = Boolean(driver?.id);

  const [values, setValues] = useState({
    firstName: driver?.firstName ?? '',
    lastName: driver?.lastName ?? '',
    email: driver?.email ?? '',
    phone: driver?.phone ?? '',
    userId: driver?.userId ?? '',
    cdlNumber: driver?.cdlNumber ?? '',
    cdlState: driver?.cdlState ?? '',
    cdlClass: driver?.cdlClass ?? '',
    cdlExpiry: toDateInputValue(driver?.cdlExpiry),
    homeTerminalId: driver?.homeTerminalId ?? '',
    payModel: driver?.payModel ?? 'per_mile',
    payRate: driver?.payRate != null ? String(driver.payRate) : '',
    payPeriod: driver?.payPeriod ?? 'weekly',
    status: driver?.status ?? 'active',
    notes: driver?.notes ?? '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!values.firstName.trim()) {
      toast.error('First name is required');
      return;
    }
    if (!values.lastName.trim()) {
      toast.error('Last name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        ...(values.email ? { email: values.email } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.userId ? { userId: values.userId } : {}),
        ...(values.cdlNumber ? { cdlNumber: values.cdlNumber } : {}),
        ...(values.cdlState ? { cdlState: values.cdlState } : {}),
        ...(values.cdlClass ? { cdlClass: values.cdlClass } : {}),
        ...(values.cdlExpiry ? { cdlExpiry: values.cdlExpiry } : {}),
        ...(values.homeTerminalId ? { homeTerminalId: values.homeTerminalId } : {}),
        payModel: values.payModel,
        ...(values.payRate ? { payRate: Number(values.payRate) } : {}),
        payPeriod: values.payPeriod,
        ...(isEdit ? { status: values.status } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      };

      const url = isEdit
        ? `/api/v1/carrier/fleet/drivers/${driver!.id}`
        : '/api/v1/carrier/fleet/drivers';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save driver');
      }

      toast.success(isEdit ? 'Driver updated' : 'Driver created');
      if (isEdit) {
        router.refresh();
      } else {
        router.refresh();
        router.push('/carrier/fleet/drivers');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="firstName">
            First Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="firstName"
            name="firstName"
            value={values.firstName}
            onChange={handleChange}
            placeholder="John"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="lastName">
            Last Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="lastName"
            name="lastName"
            value={values.lastName}
            onChange={handleChange}
            placeholder="Smith"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            value={values.email}
            onChange={handleChange}
            placeholder="driver@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="phone">
            Phone
          </label>
          <Input
            id="phone"
            name="phone"
            value={values.phone}
            onChange={handleChange}
            placeholder="+1 (555) 000-0000"
          />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <label className="text-sm font-medium text-foreground" htmlFor="userId">
            Linked User ID{' '}
            <span className="text-muted-foreground text-xs">(optional — link to existing user account)</span>
          </label>
          <Input
            id="userId"
            name="userId"
            value={values.userId}
            onChange={handleChange}
            placeholder="UUID of existing DRIVER-role user"
          />
        </div>
      </div>

      {/* CDL section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          CDL Information
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="cdlNumber">
              CDL Number
            </label>
            <Input
              id="cdlNumber"
              name="cdlNumber"
              value={values.cdlNumber}
              onChange={handleChange}
              placeholder="D1234567"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="cdlState">
              CDL State
            </label>
            <Select
              value={values.cdlState || undefined}
              onValueChange={(val) => setValues((prev) => ({ ...prev, cdlState: val }))}
            >
              <SelectTrigger id="cdlState">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="cdlClass">
              CDL Class
            </label>
            <Select
              value={values.cdlClass || undefined}
              onValueChange={(val) => setValues((prev) => ({ ...prev, cdlClass: val }))}
            >
              <SelectTrigger id="cdlClass">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Class A</SelectItem>
                <SelectItem value="B">Class B</SelectItem>
                <SelectItem value="C">Class C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="cdlExpiry">
              CDL Expiry
            </label>
            <Input
              id="cdlExpiry"
              name="cdlExpiry"
              type="date"
              value={values.cdlExpiry}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      {/* Pay configuration */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Pay Configuration
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="homeTerminalId">
              Home Terminal
            </label>
            <Select
              value={values.homeTerminalId || undefined}
              onValueChange={(val) => setValues((prev) => ({ ...prev, homeTerminalId: val }))}
            >
              <SelectTrigger id="homeTerminalId">
                <SelectValue placeholder="Select terminal" />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="payModel">
              Pay Model
            </label>
            <Select
              value={values.payModel}
              onValueChange={(val) => setValues((prev) => ({ ...prev, payModel: val }))}
            >
              <SelectTrigger id="payModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_mile">Per Mile</SelectItem>
                <SelectItem value="percentage_gross">Percentage of Gross</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="flat_rate">Flat Rate</SelectItem>
                <SelectItem value="team_split">Team Split</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="payRate">
              {PAY_RATE_LABELS[values.payModel] ?? 'Pay Rate'}
            </label>
            <Input
              id="payRate"
              name="payRate"
              type="number"
              step="0.0001"
              min="0"
              value={values.payRate}
              onChange={handleChange}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="payPeriod">
              Pay Period
            </label>
            <Select
              value={values.payPeriod}
              onValueChange={(val) => setValues((prev) => ({ ...prev, payPeriod: val }))}
            >
              <SelectTrigger id="payPeriod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Status (edit only) */}
      {isEdit && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="driverStatus">
            Status
          </label>
          <Select
            value={values.status}
            onValueChange={(val) => setValues((prev) => ({ ...prev, status: val }))}
          >
            <SelectTrigger id="driverStatus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="driverNotes">
          Notes
        </label>
        <Textarea
          id="driverNotes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          placeholder="Additional notes about this driver..."
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/carrier/fleet/drivers')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Driver'}
        </Button>
      </div>
    </form>
  );
}
