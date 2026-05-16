'use client';

/**
 * CsvExportButton — Small secondary button that triggers a streaming CSV download.
 * Uses window.location.href so the browser handles Content-Disposition natively.
 */

import React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CsvExportButtonProps {
  endpoint: string;
  params: Record<string, string | string[] | undefined>;
  filename?: string;
}

export function CsvExportButton({ endpoint, params }: CsvExportButtonProps) {
  function handleClick() {
    const sp = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val === undefined) continue;
      if (Array.isArray(val)) {
        for (const v of val) {
          sp.append(key, v);
        }
      } else {
        sp.set(key, val);
      }
    }
    sp.set('format', 'csv');
    window.location.href = `${endpoint}?${sp.toString()}`;
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} className="gap-1.5">
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  );
}
