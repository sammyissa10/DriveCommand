'use client';

import { useEffect, useState } from 'react';
import { AgingDesktop } from './AgingDesktop';
import { AgingMobile } from './AgingMobile';
import type { AgingRow } from './aging-report-utils';

export default function AgingReportPage() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/reports/aging')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => setRows(json.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <AgingMobile rows={rows} loading={loading} />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block">
        <AgingDesktop rows={rows} loading={loading} />
      </div>
    </>
  );
}
