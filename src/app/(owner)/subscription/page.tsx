export const dynamic = 'force-dynamic';

import { getMySubscriptionInvoices } from '@/app/(owner)/actions/subscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'DRAFT': return 'bg-gray-100 text-gray-600';
    case 'SENT': return 'bg-blue-100 text-blue-700';
    case 'PAID': return 'bg-green-100 text-green-700';
    case 'OVERDUE': return 'bg-red-100 text-red-700';
    case 'VOID': return 'bg-gray-100 text-gray-400';
    default: return 'bg-gray-100 text-gray-600';
  }
}

export default async function SubscriptionPage() {
  const invoices = await getMySubscriptionInvoices();

  const unpaidTotal = invoices
    .filter((inv) => inv.status === 'SENT' || inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const overdueCount = invoices.filter((inv) => inv.status === 'OVERDUE').length;
  const paidCount = invoices.filter((inv) => inv.status === 'PAID').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Subscription & Billing</h1>
        <p className="mt-1 text-sm text-gray-500">Your DriveCommand subscription invoices</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Amount Due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">
              {unpaidTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {overdueCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{paidCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-500">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-6 py-3">Issue Date</th>
                  <th className="px-6 py-3">Due Date</th>
                  <th className="px-6 py-3">Billing Period</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-xs font-medium text-gray-900">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {new Date(invoice.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {invoice.billingPeriodStart && invoice.billingPeriodEnd
                        ? `${new Date(invoice.billingPeriodStart).toLocaleDateString()} — ${new Date(invoice.billingPeriodEnd).toLocaleDateString()}`
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {Number(invoice.total).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClasses(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
