'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listTenantSendLog,
  type SendLogStats,
  type SendLogPaginatedResult,
} from '@/app/(owner)/actions/tenant-notification-settings';
import type { NotificationSendStatus, NotificationChannel } from '@/generated/prisma';

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
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}
    >
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

interface TenantSendLogTabProps {
  initialSendLog: SendLogPaginatedResult;
  initialStats: SendLogStats;
  /**
   * quick-556: pre-selects the status dropdown when the failure banner above
   * the tabs sends the reader here, so the first thing they see is the failures
   * rather than an unfiltered log they then have to filter themselves.
   */
  initialStatus?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantSendLogTab({ initialSendLog, initialStats, initialStatus }: TenantSendLogTabProps) {
  const [rows, setRows] = useState(initialSendLog.rows);
  const [total, setTotal] = useState(initialSendLog.total);
  const [page, setPage] = useState(initialSendLog.page);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [triggerKey, setTriggerKey] = useState('');
  const [status, setStatus] = useState<string>(initialStatus ?? 'all');
  const [channel, setChannel] = useState<string>('all');

  const pageSize = initialSendLog.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchRows = async (newPage: number) => {
    setLoading(true);
    try {
      const result = await listTenantSendLog({
        triggerKey: triggerKey || undefined,
        status: (status && status !== 'all' ? status : undefined) as NotificationSendStatus | undefined,
        channel: (channel && channel !== 'all' ? channel : undefined) as NotificationChannel | undefined,
        page: newPage,
        pageSize,
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
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total (30d)" value={initialStats.total} />
        <KpiCard label="Sent" value={initialStats.sent} />
        <KpiCard label="Failed" value={initialStats.failed} />
        <KpiCard label="Skipped" value={initialStats.skipped} />
        <KpiCard label="Pending" value={initialStats.pending} />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger>
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="EMAIL">EMAIL</SelectItem>
              <SelectItem value="IN_APP">IN_APP</SelectItem>
            </SelectContent>
          </Select>
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
              {['Date', 'Trigger Key', 'Recipient Email', 'Channel', 'Status', 'Subject'].map(
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
                    <td colSpan={6} className="px-4 py-3">
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
                <td colSpan={6} className="text-center py-12 text-gray-500">
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
              ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
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
