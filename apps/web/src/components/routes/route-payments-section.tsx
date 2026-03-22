'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PaymentForm } from './payment-form';
import { deletePayment } from '@/app/(owner)/actions/payments';

interface RoutePaymentsSectionProps {
  routeId: string;
  routeStatus: string;
  initialPayments: Array<{
    id: string;
    amount: any; // Prisma Decimal, serialized as string
    status: string;
    paidAt: Date | null;
    notes: string | null;
    createdAt: Date;
  }>;
}

function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function RoutePaymentsSection({
  routeId,
  routeStatus,
  initialPayments,
}: RoutePaymentsSectionProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(
    null
  );
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(
    null
  );

  const isCompleted = routeStatus === 'COMPLETED';

  const handleAddSuccess = () => {
    setShowAddForm(false);
    router.refresh();
  };

  const handleEditSuccess = () => {
    setEditingPaymentId(null);
    router.refresh();
  };

  const handleDelete = async (paymentId: string) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) {
      return;
    }

    setDeletingPaymentId(paymentId);
    const result = await deletePayment(paymentId);
    setDeletingPaymentId(null);

    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  // Calculate total revenue
  const totalRevenue = initialPayments.reduce((sum, payment) => {
    return sum + parseFloat(payment.amount.toString());
  }, 0);

  return (
    <div className="space-y-4">
      {/* Completed Route Notice */}
      {isCompleted && (
        <div className="rounded-lg bg-muted/50 border border-border p-3">
          <p className="text-sm text-muted-foreground">
            Payments are locked for completed routes.
          </p>
        </div>
      )}

      {/* Add Payment Button */}
      {!isCompleted && !showAddForm && !editingPaymentId && (
        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Record Payment
        </button>
      )}

      {/* Add Payment Form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-card-foreground mb-3">
            Record New Payment
          </h3>
          <PaymentForm
            routeId={routeId}
            onCancel={() => setShowAddForm(false)}
            onSuccess={handleAddSuccess}
          />
        </div>
      )}

      {/* Payments List */}
      {initialPayments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No payments recorded yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialPayments.map((payment) => {
            const isEditing = editingPaymentId === payment.id;
            const isDeleting = deletingPaymentId === payment.id;
            const isPaid = payment.status === 'PAID';

            return (
              <div
                key={payment.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                {isEditing ? (
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground mb-3">
                      Edit Payment
                    </h3>
                    <PaymentForm
                      routeId={routeId}
                      payment={{
                        id: payment.id,
                        amount: payment.amount.toString(),
                        status: payment.status,
                        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
                        notes: payment.notes,
                      }}
                      onCancel={() => setEditingPaymentId(null)}
                      onSuccess={handleEditSuccess}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            isPaid
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {payment.status}
                        </span>
                        {/* Amount */}
                        <span className="text-lg font-semibold text-foreground">
                          {formatCurrency(payment.amount.toString())}
                        </span>
                      </div>

                      {/* Paid Date */}
                      {payment.paidAt && (
                        <p className="text-sm text-muted-foreground mb-1">
                          Paid on {formatDate(payment.paidAt)}
                        </p>
                      )}

                      {/* Notes */}
                      {payment.notes && (
                        <p className="text-sm text-muted-foreground">
                          {payment.notes}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {!isCompleted && (
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => setEditingPaymentId(payment.id)}
                          disabled={isDeleting}
                          className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                          title="Edit payment"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(payment.id)}
                          disabled={isDeleting}
                          className="rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          title="Delete payment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Total Revenue */}
      {initialPayments.length > 0 && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Total Revenue
            </span>
            <span className="text-xl font-bold text-foreground">
              {formatCurrency(totalRevenue)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
