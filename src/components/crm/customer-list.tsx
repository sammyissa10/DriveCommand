'use client';

import Link from 'next/link';
import { Building2, Mail, Phone, Star } from 'lucide-react';

interface Customer {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  priority: string;
  status: string;
  totalLoads: number;
  totalRevenue: any;
  lastLoadDate: Date | null;
  _count: { interactions: number };
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  VIP: 'bg-amber-100 text-amber-700',
};

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-700',
  PROSPECT: 'bg-purple-100 text-purple-700',
};

export function CustomerList({ customers }: { customers: Customer[] }) {
  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No customers yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your first customer to start tracking relationships.
        </p>
        <Link
          href="/crm/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add Customer
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Priority</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Loads</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/crm/${customer.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                    {customer.companyName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-0.5">
                    {customer.contactName && (
                      <div className="text-foreground">{customer.contactName}</div>
                    )}
                    <div className="flex items-center gap-3 text-muted-foreground">
                      {customer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </span>
                      )}
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[customer.priority]}`}>
                    {customer.priority === 'VIP' && <Star className="h-3 w-3" />}
                    {customer.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[customer.status]}`}>
                    {customer.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium">{customer.totalLoads}</td>
                <td className="px-4 py-3 text-right font-medium">
                  ${Number(customer.totalRevenue).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3 p-3">
        {customers.map((customer) => (
          <Link
            key={customer.id}
            href={`/crm/${customer.id}`}
            className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="font-semibold text-foreground">{customer.companyName}</div>
            {customer.contactName && (
              <div className="text-sm text-muted-foreground mt-0.5">{customer.contactName}</div>
            )}
            <div className="flex flex-col gap-0.5 mt-1">
              {customer.email && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  {customer.email}
                </span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0" />
                  {customer.phone}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${priorityColors[customer.priority]}`}>
                {customer.priority === 'VIP' && <Star className="h-3 w-3" />}
                {customer.priority}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[customer.status]}`}>
                {customer.status}
              </span>
            </div>
            <div className="flex gap-4 mt-2 text-sm font-medium">
              <span>{customer.totalLoads} loads</span>
              <span>${Number(customer.totalRevenue).toLocaleString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
