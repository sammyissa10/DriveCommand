'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  listNotificationSendLog,
  type SendLogStats,
  type SendLogRow,
} from '@/app/(admin)/actions/notifications';
import type { NotificationSendStatus } from '@/generated/prisma';
import { HealthTile } from './health-tile';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  PENDING: 'bg-gray-100 text-gray-600',
  SKIPPED_DISABLED: 'bg-yellow-100 text-yellow-700',
  SKIPPED_USER_PREF: 'bg-yellow-100 text-yellow-700',
  SKIPPED_IDEMPOTENT: 'bg-yellow-100 text-yellow-700',
};

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SendLogTabProps {
  initialStats: SendLogStats;
  initialRows: SendLogRow[];
  initialTotal: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendLogTab({ initialStats, initialRows, initialTotal }: SendLogTabProps) {
  const [rows, setRows] = useState<SendLogRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [tenantId, setTenantId] = useState('');
  const [triggerKey, setTriggerKey] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recipient, setRecipient] = useState('');

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchRows = async (newPage: number) => {
    setLoading(true);
    try {
      const result = await listNotificationSendLog({
        tenantId: tenantId || undefined,
        triggerKey: triggerKey || undefined,
        status: (status && status !== 'all' ? status : undefined) as NotificationSendStatus | undefined,
        from: from || undefined,
        to: to || undefined,
        recipient: recipient || undefined,
        page: newPage,
      });
      setRows(result.rows);
      setTotal(result.total);
      setPage(newPage);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchRows(1);
  };

  const handlePrev = () => {
    if (page > 1) fetchRows(page - 1);
  };

  const handleNext = () => {
    if (page < totalPages) fetchRows(page + 1);
  };

  const toggleExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Health Tile — last-24h sent/failed/failure rate */}
      <HealthTile />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Sent Today" value={initialStats.sentToday} />
        <KpiCard label="Failed Today" value={initialStats.failedToday} />
        <KpiCard label="Sent (30d)" value={initialStats.sent30d} />
        <KpiCard label="Failure Rate" value={`${initialStats.failureRate}%`} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Input
            placeholder="Tenant ID"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          />
          <Input
            placeholder="Trigger key"
            value={triggerKey}
            onChange={(e) => setTriggerKey(e.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="SENT">SENT</SelectItem>
              <SelectItem value="FAILED">FAILED</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
              <SelectItem value="SKIPPED_DISABLED">SKIPPED_DISABLED</SelectItem>
              <SelectItem value="SKIPPED_USER_PREF">SKIPPED_USER_PREF</SelectItem>
              <SelectItem value="SKIPPED_IDEMPOTENT">SKIPPED_IDEMPOTENT</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            placeholder="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            placeholder="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Input
            placeholder="Recipient email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
        <div className="flex justify-end mt-3">
          <Button onClick={handleSearch} disabled={loading} size="sm">
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Tenant ID', 'Trigger Key', 'Recipient Email', 'Channel', 'Status', 'Subject'].map(
                (col) => (
                  <th
                    key={col}
                    className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3"
                  >
                    {col}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <>
                <tr
                  key={row.id}
                  className={`border-b ${row.status === 'FAILED' ? 'cursor-pointer hover:bg-red-50' : 'hover:bg-gray-50'}`}
                  onClick={() => row.status === 'FAILED' && toggleExpand(row.id)}
                >
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-500">
                      {row.tenantId.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-600">{row.triggerKey}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.recipientEmail ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.channel}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                    {row.subject ?? '—'}
                  </td>
                </tr>
                {expandedRowId === row.id && row.errorMessage && (
                  <tr key={`${row.id}-expanded`} className="bg-red-50 border-b">
                    <td colSpan={7} className="px-4 py-3">
                      <p className="text-xs font-medium text-red-700 mb-1">Error Details</p>
                      <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono bg-red-100 rounded p-2">
                        {row.errorMessage}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  No send log entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">
            {total > 0
              ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
              : 'No results'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={page <= 1 || loading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
