/**
 * ReportTableSkeleton — Skeleton placeholder for report tables while loading.
 */

import React from 'react';

interface ReportTableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function ReportTableSkeleton({ rows = 8, columns = 5 }: ReportTableSkeletonProps) {
  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/40">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <div className="h-4 bg-muted rounded animate-pulse w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <div
                    className="h-4 bg-muted rounded animate-pulse"
                    style={{ width: `${60 + ((rowIdx * colIdx * 7) % 40)}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
