'use client';

import { useState } from 'react';
import { LaneData } from '@/app/(owner)/actions/lane-analytics';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

interface LaneProfitabilityTableProps {
  lanes: LaneData[];
}

type SortColumn =
  | 'lane'
  | 'routeCount'
  | 'totalRevenue'
  | 'totalExpenses'
  | 'profit'
  | 'marginPercent'
  | 'avgProfitPerRoute'
  | 'profitPerMile';

type SortDirection = 'asc' | 'desc';

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(parseFloat(value));
}

function getMarginColor(margin: number): string {
  if (margin < 0) return 'text-red-600';
  if (margin < 10) return 'text-amber-600';
  return 'text-green-600';
}

function getProfitColor(profit: string): string {
  return parseFloat(profit) >= 0 ? 'text-green-600' : 'text-red-600';
}

function SortIcon({ column, sortCol, sortDir }: { column: SortColumn; sortCol: SortColumn; sortDir: SortDirection }) {
  if (column !== sortCol) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-muted-foreground/50" />;
  return sortDir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-1" />
    : <ChevronDown className="inline h-3 w-3 ml-1" />;
}

export function LaneProfitabilityTable({ lanes }: LaneProfitabilityTableProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('profit');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  if (lanes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Lane Breakdown</h2>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No completed routes found in the selected timeframe</p>
        </div>
      </div>
    );
  }

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const sorted = [...lanes].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortCol) {
      case 'lane':
        aVal = a.lane;
        bVal = b.lane;
        break;
      case 'routeCount':
        aVal = a.routeCount;
        bVal = b.routeCount;
        break;
      case 'totalRevenue':
        aVal = parseFloat(a.totalRevenue);
        bVal = parseFloat(b.totalRevenue);
        break;
      case 'totalExpenses':
        aVal = parseFloat(a.totalExpenses);
        bVal = parseFloat(b.totalExpenses);
        break;
      case 'profit':
        aVal = parseFloat(a.profit);
        bVal = parseFloat(b.profit);
        break;
      case 'marginPercent':
        aVal = a.marginPercent;
        bVal = b.marginPercent;
        break;
      case 'avgProfitPerRoute':
        aVal = parseFloat(a.avgProfitPerRoute);
        bVal = parseFloat(b.avgProfitPerRoute);
        break;
      case 'profitPerMile':
        aVal = a.profitPerMile !== null ? parseFloat(a.profitPerMile) : -Infinity;
        bVal = b.profitPerMile !== null ? parseFloat(b.profitPerMile) : -Infinity;
        break;
      default:
        return 0;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDir === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const thClass =
    'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors';
  const tdClass = 'px-4 py-3 text-sm';

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold">Lane Breakdown</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {lanes.length} lane{lanes.length !== 1 ? 's' : ''} — click column headers to sort
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/30">
            <tr>
              <th className={thClass} onClick={() => handleSort('lane')}>
                Lane <SortIcon column="lane" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('routeCount')}>
                Routes <SortIcon column="routeCount" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('totalRevenue')}>
                Revenue <SortIcon column="totalRevenue" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('totalExpenses')}>
                Expenses <SortIcon column="totalExpenses" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('profit')}>
                Profit <SortIcon column="profit" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('marginPercent')}>
                Margin % <SortIcon column="marginPercent" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('avgProfitPerRoute')}>
                Avg Profit/Route <SortIcon column="avgProfitPerRoute" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thClass} onClick={() => handleSort('profitPerMile')}>
                Profit/Mile <SortIcon column="profitPerMile" sortCol={sortCol} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((lane, i) => (
              <tr key={lane.lane} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                {/* Lane column: origin/destination on separate lines */}
                <td className={tdClass}>
                  <div>
                    <span className="font-semibold">{lane.origin}</span>
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    &#8594; {lane.destination}
                  </div>
                </td>
                <td className={tdClass}>{lane.routeCount}</td>
                <td className={tdClass}>{formatCurrency(lane.totalRevenue)}</td>
                <td className={tdClass}>{formatCurrency(lane.totalExpenses)}</td>
                <td className={`${tdClass} font-semibold ${getProfitColor(lane.profit)}`}>
                  {formatCurrency(lane.profit)}
                </td>
                <td className={`${tdClass} font-medium ${getMarginColor(lane.marginPercent)}`}>
                  {lane.marginPercent.toFixed(1)}%
                </td>
                <td className={`${tdClass} ${getProfitColor(lane.avgProfitPerRoute)}`}>
                  {formatCurrency(lane.avgProfitPerRoute)}
                </td>
                <td className={tdClass}>
                  {lane.profitPerMile !== null
                    ? formatCurrency(lane.profitPerMile)
                    : <span className="text-muted-foreground">N/A</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
