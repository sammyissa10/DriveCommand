'use client';

import { useEffect, useState, useCallback } from 'react';
import { RevenueDesktop } from './RevenueDesktop';
import { RevenueMobile } from './RevenueMobile';
import {
  getCurrentYearStart,
  getTodayISO,
  type RevenueReport,
  type CarrierClient,
} from './revenue-report-utils';

export default function RevenueReportPage() {
  const [dateFrom, setDateFrom] = useState(getCurrentYearStart());
  const [dateTo, setDateTo] = useState(getTodayISO());
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<CarrierClient[]>([]);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch client list for filter dropdown
  useEffect(() => {
    fetch('/api/v1/carrier/clients?pageSize=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setClients(json?.data?.items ?? []))
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (clientId) params.set('client_id', clientId);
      const res = await fetch(`/api/v1/carrier/reports/revenue?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load revenue report');
      const json = await res.json();
      setReport(json.data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, clientId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <RevenueMobile
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          clientId={clientId}
          setClientId={setClientId}
          clients={clients}
          report={report}
          loading={loading}
        />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block">
        <RevenueDesktop
          dateFrom={dateFrom}
          setDateFrom={setDateFrom}
          dateTo={dateTo}
          setDateTo={setDateTo}
          clientId={clientId}
          setClientId={setClientId}
          clients={clients}
          report={report}
          loading={loading}
          fetchReport={fetchReport}
        />
      </div>
    </>
  );
}
