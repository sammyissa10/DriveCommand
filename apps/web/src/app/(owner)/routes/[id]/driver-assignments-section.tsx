'use client';

import { useState, useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Star } from 'lucide-react';
import {
  createDriverRouteJoin,
  updateDriverRouteJoin,
  deleteDriverRouteJoin,
} from '@/app/(owner)/actions/driver-route-joins';

// Types inferred from server action return
type DriverInfo = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

type DriverRouteJoinWithDriver = {
  id: string;
  routeId: string;
  driverId: string;
  isMainDriver: boolean;
  paymentMethod: 'FIXED_AMOUNT' | 'HOURLY' | 'PER_MILE';
  fixedAmount: any | null;
  hourlyRate: any | null;
  numberOfHours: any | null;
  perMileRate: any | null;
  numberOfMiles: any | null;
  createdAt: Date;
  driver: DriverInfo;
};

interface DriverAssignmentsSectionProps {
  routeId: string;
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null; email: string }>;
  initialAssignments: DriverRouteJoinWithDriver[];
}

type PaymentMethod = 'FIXED_AMOUNT' | 'HOURLY' | 'PER_MILE';

function formatCurrency(value: any, decimals = 2): string {
  const num = parseFloat(value?.toString() ?? '0');
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

function computeTotal(assignment: DriverRouteJoinWithDriver): number {
  switch (assignment.paymentMethod) {
    case 'FIXED_AMOUNT':
      return parseFloat(assignment.fixedAmount?.toString() ?? '0');
    case 'HOURLY': {
      const rate = parseFloat(assignment.hourlyRate?.toString() ?? '0');
      const hours = parseFloat(assignment.numberOfHours?.toString() ?? '0');
      return rate * hours;
    }
    case 'PER_MILE': {
      const rate = parseFloat(assignment.perMileRate?.toString() ?? '0');
      const miles = parseFloat(assignment.numberOfMiles?.toString() ?? '0');
      return rate * miles;
    }
    default:
      return 0;
  }
}

function formatPaymentSummary(assignment: DriverRouteJoinWithDriver): string {
  switch (assignment.paymentMethod) {
    case 'FIXED_AMOUNT':
      return `Fixed: ${formatCurrency(assignment.fixedAmount)}`;
    case 'HOURLY':
      return `Hourly: ${formatCurrency(assignment.hourlyRate)}/hr × ${parseFloat(assignment.numberOfHours?.toString() ?? '0')} hrs`;
    case 'PER_MILE':
      return `Per Mile: ${formatCurrency(assignment.perMileRate, 4)}/mi × ${parseFloat(assignment.numberOfMiles?.toString() ?? '0')} mi`;
    default:
      return '';
  }
}

function driverDisplayName(driver: DriverInfo): string {
  if (driver.firstName || driver.lastName) {
    return `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim();
  }
  return driver.email;
}

// Assignment form (add or edit)
function AssignmentForm({
  routeId,
  drivers,
  existingAssignment,
  assignedDriverIds,
  onCancel,
  onSuccess,
}: {
  routeId: string;
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null; email: string }>;
  existingAssignment?: DriverRouteJoinWithDriver;
  assignedDriverIds: string[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!existingAssignment;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    existingAssignment?.paymentMethod ?? 'FIXED_AMOUNT'
  );

  const boundUpdateAction = existingAssignment
    ? updateDriverRouteJoin.bind(null, existingAssignment.id)
    : null;

  const actionFn = isEdit ? boundUpdateAction! : createDriverRouteJoin;

  const [state, formAction, isPending] = useActionState(actionFn, null);

  // Available drivers: for add, exclude already-assigned; for edit, always show current
  const availableDrivers = isEdit
    ? drivers
    : drivers.filter((d) => !assignedDriverIds.includes(d.id));

  const handleSuccess = () => {
    if ((state as any)?.success) {
      onSuccess();
    }
  };

  // React to state changes
  if ((state as any)?.success) {
    onSuccess();
    return null;
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden fields */}
      {!isEdit && <input type="hidden" name="routeId" value={routeId} />}

      {/* Driver select (add only) */}
      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-1">
            Driver <span className="text-destructive">*</span>
          </label>
          <select
            name="driverId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>
              Select a driver
            </option>
            {availableDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {driverDisplayName({ ...d, email: d.id })}
                {d.firstName || d.lastName
                  ? ` (${d.id.slice(0, 6)}...)`
                  : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Driver select for add — use email as display */}
      {!isEdit && (
        <div className="hidden">
          {/* re-render with proper label */}
        </div>
      )}

      {/* Is Main Driver */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isMainDriver"
          name="isMainDriver"
          value="true"
          defaultChecked={existingAssignment?.isMainDriver ?? false}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <label htmlFor="isMainDriver" className="text-sm font-medium text-card-foreground">
          Main Driver for this route
        </label>
      </div>
      {/* Hidden false value for isMainDriver when unchecked */}
      <input type="hidden" name="isMainDriver" value="false" />

      {/* Payment Method */}
      <div>
        <label className="block text-sm font-medium text-card-foreground mb-1">
          Payment Method <span className="text-destructive">*</span>
        </label>
        <select
          name="paymentMethod"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="FIXED_AMOUNT">Fixed Amount</option>
          <option value="HOURLY">Hourly</option>
          <option value="PER_MILE">Per Mile</option>
        </select>
      </div>

      {/* Conditional fields */}
      {paymentMethod === 'FIXED_AMOUNT' && (
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-1">
            Fixed Amount <span className="text-destructive">*</span>
          </label>
          <input
            type="number"
            name="fixedAmount"
            step="0.01"
            min="0"
            required
            defaultValue={existingAssignment?.fixedAmount?.toString() ?? ''}
            placeholder="0.00"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {paymentMethod === 'HOURLY' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Hourly Rate <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="hourlyRate"
              step="0.01"
              min="0"
              required
              defaultValue={existingAssignment?.hourlyRate?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Number of Hours <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="numberOfHours"
              step="0.01"
              min="0"
              required
              defaultValue={existingAssignment?.numberOfHours?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {paymentMethod === 'PER_MILE' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Per-Mile Rate <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="perMileRate"
              step="0.0001"
              min="0"
              required
              defaultValue={existingAssignment?.perMileRate?.toString() ?? ''}
              placeholder="0.0000"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Number of Miles <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="numberOfMiles"
              step="0.01"
              min="0"
              required
              defaultValue={existingAssignment?.numberOfMiles?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {(state as any)?.error && (
        <p className="text-sm text-destructive">{(state as any).error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Driver'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DriverAssignmentsSection({
  routeId,
  drivers,
  initialAssignments,
}: DriverAssignmentsSectionProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingJoinId, setEditingJoinId] = useState<string | null>(null);
  const [deletingJoinId, setDeletingJoinId] = useState<string | null>(null);

  const assignedDriverIds = initialAssignments.map((a) => a.driverId);

  const handleAddSuccess = () => {
    setShowAddForm(false);
    router.refresh();
  };

  const handleEditSuccess = () => {
    setEditingJoinId(null);
    router.refresh();
  };

  const handleDelete = async (joinId: string) => {
    if (!window.confirm('Remove this driver assignment?')) return;
    setDeletingJoinId(joinId);
    const result = await deleteDriverRouteJoin(joinId);
    setDeletingJoinId(null);
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  // Drivers with email for display
  const driversWithEmail = drivers.map((d) => ({
    ...d,
    email: d.id, // fallback; the server fetches email separately
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-card-foreground">Driver Assignments</h2>
        {!showAddForm && !editingJoinId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Driver
          </button>
        )}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
          <h3 className="text-sm font-semibold text-card-foreground mb-3">Add Driver Assignment</h3>
          <DriverAssignmentFormWithEmailDrivers
            routeId={routeId}
            routeDrivers={initialAssignments.map((a) => ({
              id: a.driverId,
              firstName: a.driver.firstName,
              lastName: a.driver.lastName,
              email: a.driver.email,
            }))}
            drivers={drivers}
            existingAssignment={undefined}
            assignedDriverIds={assignedDriverIds}
            onCancel={() => setShowAddForm(false)}
            onSuccess={handleAddSuccess}
          />
        </div>
      )}

      {/* Assignments List */}
      {initialAssignments.length === 0 && !showAddForm ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No driver assignments yet. Add a driver to track payment details.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialAssignments.map((assignment) => {
            const isEditing = editingJoinId === assignment.id;
            const isDeleting = deletingJoinId === assignment.id;
            const total = computeTotal(assignment);

            return (
              <div
                key={assignment.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                {isEditing ? (
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground mb-3">
                      Edit Assignment
                    </h3>
                    <DriverAssignmentFormWithEmailDrivers
                      routeId={routeId}
                      routeDrivers={[]}
                      drivers={drivers}
                      existingAssignment={assignment}
                      assignedDriverIds={assignedDriverIds}
                      onCancel={() => setEditingJoinId(null)}
                      onSuccess={handleEditSuccess}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Driver name + Main Driver badge */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-card-foreground">
                          {driverDisplayName(assignment.driver)}
                        </span>
                        {assignment.isMainDriver && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <Star className="h-3 w-3" />
                            Main Driver
                          </span>
                        )}
                      </div>
                      {/* Payment summary */}
                      <p className="text-sm text-muted-foreground mb-0.5">
                        {formatPaymentSummary(assignment)}
                      </p>
                      {/* Computed total */}
                      <p className="text-sm font-medium text-foreground">
                        Total: {formatCurrency(total)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      <button
                        onClick={() => setEditingJoinId(assignment.id)}
                        disabled={isDeleting}
                        className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                        title="Edit assignment"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(assignment.id)}
                        disabled={isDeleting}
                        className="rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        title="Remove assignment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Wrapper that passes drivers with proper email from the full drivers list
function DriverAssignmentFormWithEmailDrivers({
  routeId,
  routeDrivers,
  drivers,
  existingAssignment,
  assignedDriverIds,
  onCancel,
  onSuccess,
}: {
  routeId: string;
  routeDrivers: Array<{ id: string; firstName: string | null; lastName: string | null; email: string }>;
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null; email: string }>;
  existingAssignment?: DriverRouteJoinWithDriver;
  assignedDriverIds: string[];
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!existingAssignment;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    existingAssignment?.paymentMethod ?? 'FIXED_AMOUNT'
  );
  const [isMainDriver, setIsMainDriver] = useState(
    existingAssignment?.isMainDriver ?? false
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const availableDrivers = isEdit
    ? drivers
    : drivers.filter((d) => !assignedDriverIds.includes(d.id));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    // Override isMainDriver with controlled state
    formData.set('isMainDriver', isMainDriver ? 'true' : 'false');

    let result: any;
    if (isEdit && existingAssignment) {
      result = await updateDriverRouteJoin(existingAssignment.id, null, formData);
    } else {
      result = await createDriverRouteJoin(null, formData);
    }

    setIsPending(false);

    if (result?.error) {
      setError(result.error);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && <input type="hidden" name="routeId" value={routeId} />}

      {/* Driver select (add only) */}
      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-1">
            Driver <span className="text-destructive">*</span>
          </label>
          <select
            name="driverId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>
              Select a driver
            </option>
            {availableDrivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.firstName || d.lastName
                  ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim()
                  : d.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Is Main Driver */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`isMainDriver-${existingAssignment?.id ?? 'new'}`}
          checked={isMainDriver}
          onChange={(e) => setIsMainDriver(e.target.checked)}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
        <label
          htmlFor={`isMainDriver-${existingAssignment?.id ?? 'new'}`}
          className="text-sm font-medium text-card-foreground"
        >
          Main Driver for this route
        </label>
      </div>

      {/* Payment Method */}
      <div>
        <label className="block text-sm font-medium text-card-foreground mb-1">
          Payment Method <span className="text-destructive">*</span>
        </label>
        <select
          name="paymentMethod"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="FIXED_AMOUNT">Fixed Amount</option>
          <option value="HOURLY">Hourly</option>
          <option value="PER_MILE">Per Mile</option>
        </select>
      </div>

      {/* Conditional fields */}
      {paymentMethod === 'FIXED_AMOUNT' && (
        <div>
          <label className="block text-sm font-medium text-card-foreground mb-1">
            Fixed Amount ($) <span className="text-destructive">*</span>
          </label>
          <input
            type="number"
            name="fixedAmount"
            step="0.01"
            min="0"
            required
            defaultValue={existingAssignment?.fixedAmount?.toString() ?? ''}
            placeholder="0.00"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {paymentMethod === 'HOURLY' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Hourly Rate ($/hr) <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="hourlyRate"
              step="0.01"
              min="0"
              required
              defaultValue={existingAssignment?.hourlyRate?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Number of Hours <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="numberOfHours"
              step="0.01"
              min="0"
              required
              defaultValue={existingAssignment?.numberOfHours?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {paymentMethod === 'PER_MILE' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Per-Mile Rate ($/mi) <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="perMileRate"
              step="0.0001"
              min="0"
              required
              defaultValue={existingAssignment?.perMileRate?.toString() ?? ''}
              placeholder="0.0000"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-card-foreground mb-1">
              Number of Miles <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              name="numberOfMiles"
              step="0.01"
              min="0"
              required
              defaultValue={existingAssignment?.numberOfMiles?.toString() ?? ''}
              placeholder="0.00"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Driver'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
