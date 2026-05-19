import { Suspense } from 'react';
import { DataGridDemoClient } from './DataGridDemoClient';
import { GridLoadingSkeleton } from '@/components/data-grid';

/**
 * DataGrid Demo Page
 *
 * Wraps the client component in Suspense for static generation compatibility.
 */
export default function DataGridDemoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background p-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <div className="h-8 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-96 bg-muted animate-pulse rounded mt-2" />
            </div>
            <div className="border rounded-lg">
              <GridLoadingSkeleton rowCount={10} columnCount={6} showSelection />
            </div>
          </div>
        </div>
      }
    >
      <DataGridDemoClient />
    </Suspense>
  );
}
