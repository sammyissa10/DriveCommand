'use client';

import { AlertCircle, Clock, Shield, ShieldAlert } from 'lucide-react';
import type { ComplianceDashboardData } from '@/app/(owner)/actions/compliance';

interface ComplianceSummaryCardsProps {
  summary: ComplianceDashboardData['summary'];
}

export function ComplianceSummaryCards({ summary }: ComplianceSummaryCardsProps) {
  const {
    expiredCount,
    expiringSoonCount,
    criticalSafetyCount,
    highSafetyCount,
  } = summary;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Expired Documents */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Expired Documents</p>
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
        </div>
        <p className={`mt-3 text-3xl font-bold ${expiredCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
          {expiredCount}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Require immediate action</p>
      </div>

      {/* Expiring Soon */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Expiring Soon (30d)</p>
          <Clock className="h-5 w-5 text-amber-500 shrink-0" />
        </div>
        <p className={`mt-3 text-3xl font-bold ${expiringSoonCount > 0 ? 'text-amber-500' : 'text-foreground'}`}>
          {expiringSoonCount}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Expiring within 30 days</p>
      </div>

      {/* Critical Safety Events */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Critical Events (90d)</p>
          <Shield className="h-5 w-5 text-destructive shrink-0" />
        </div>
        <p className={`mt-3 text-3xl font-bold ${criticalSafetyCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
          {criticalSafetyCount}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">CRITICAL severity in last 90 days</p>
      </div>

      {/* High Safety Events */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">High Events (90d)</p>
          <ShieldAlert className="h-5 w-5 text-orange-500 shrink-0" />
        </div>
        <p className={`mt-3 text-3xl font-bold ${highSafetyCount > 0 ? 'text-orange-500' : 'text-foreground'}`}>
          {highSafetyCount}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">HIGH severity in last 90 days</p>
      </div>
    </div>
  );
}
