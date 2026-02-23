'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, MapPin, Gauge, Fuel } from 'lucide-react';
import type { IFTAReportRow, IFTAReportData } from '@/app/(owner)/actions/ifta';

interface IFTAReportTableProps {
  rows: IFTAReportRow[];
  totals: IFTAReportData['totals'];
  quarter: 1 | 2 | 3 | 4;
  year: number;
  csvContent: string;
}

/**
 * IFTA report table with summary cards and CSV download.
 * Uses native HTML table with Tailwind classes — consistent with codebase pattern.
 */
export function IFTAReportTable({
  rows,
  totals,
  quarter,
  year,
  csvContent,
}: IFTAReportTableProps) {
  // Filter out rows with both 0 miles and 0 gallons (defensive — server should already omit these)
  const filteredRows = rows.filter(
    (r) => r.milesDriven > 0 || r.fuelGallons > 0
  );

  function handleDownloadCSV() {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ifta-${year}-q${quarter}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const thClass =
    'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap';
  const tdClass = 'px-4 py-3 text-sm';

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">States Operated In</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.stateCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Q{quarter} {year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Miles Driven</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.totalMiles.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From GPS records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Fuel Purchased</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.totalGallons.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{' '}
              <span className="text-base font-normal text-muted-foreground">gal</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From fuel records
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">State-by-State Breakdown</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Miles driven and fuel purchased per jurisdiction — Q{quarter} {year}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCSV}
            disabled={filteredRows.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>

        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <Fuel className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No data for this quarter</p>
            <p className="text-sm text-muted-foreground mt-1">
              GPS and fuel records will appear here once your fleet has activity in the selected period.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/30">
                <tr>
                  <th className={thClass}>State</th>
                  <th className={thClass}>State Name</th>
                  <th className={`${thClass} text-right`}>Miles Driven</th>
                  <th className={`${thClass} text-right`}>Fuel Purchased (gal)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row, i) => (
                  <tr
                    key={row.stateCode}
                    className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                  >
                    <td className={`${tdClass} font-mono font-semibold`}>
                      {row.stateCode}
                    </td>
                    <td className={tdClass}>{row.stateName}</td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {row.milesDriven > 0
                        ? row.milesDriven.toLocaleString(undefined, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums`}>
                      {row.fuelGallons > 0
                        ? row.fuelGallons.toLocaleString(undefined, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className={`${tdClass} font-mono`}>TOTAL</td>
                  <td className={tdClass}>All States</td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {totals.totalMiles.toLocaleString(undefined, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    {totals.totalGallons.toLocaleString(undefined, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
