import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getIFTAReport, generateIFTACSV } from '@/app/(owner)/actions/ifta';
import { IFTAQuarterSelector } from '@/components/ifta/ifta-quarter-selector';
import { IFTAReportTable } from '@/components/ifta/ifta-report-table';

// Force fresh data on every load — tax data must never be stale
export const fetchCache = 'force-no-store';

/**
 * Returns the current IFTA quarter (1–4) based on today's month.
 */
function getCurrentQuarter(): 1 | 2 | 3 | 4 {
  const month = new Date().getMonth(); // 0-indexed
  if (month < 3) return 1;
  if (month < 6) return 2;
  if (month < 9) return 3;
  return 4;
}

export default async function IFTAPage({
  searchParams,
}: {
  searchParams: Promise<{ quarter?: string; year?: string }>;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Await searchParams (Next.js 16 requirement)
  const { quarter: quarterParam, year: yearParam } = await searchParams;

  const now = new Date();
  const thisYear = now.getFullYear();

  // Parse and validate quarter param
  const parsedQuarter = quarterParam ? parseInt(quarterParam, 10) : null;
  const quarter: 1 | 2 | 3 | 4 =
    parsedQuarter && parsedQuarter >= 1 && parsedQuarter <= 4
      ? (parsedQuarter as 1 | 2 | 3 | 4)
      : getCurrentQuarter();

  // Parse and validate year param
  const parsedYear = yearParam ? parseInt(yearParam, 10) : null;
  const year: number =
    parsedYear && parsedYear >= 2020 && parsedYear <= thisYear + 1
      ? parsedYear
      : thisYear;

  // Compute IFTA data
  const reportData = await getIFTAReport(quarter, year);

  // Generate CSV content on the server (passed to client for download)
  const csvContent = await generateIFTACSV(
    reportData.rows,
    reportData.totals,
    quarter,
    year
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">IFTA Fuel Tax Report</h1>
          <p className="text-muted-foreground mt-1">
            Quarterly miles driven and fuel purchased by state — for IFTA tax filing
          </p>
        </div>

        {/* Quarter + year selector */}
        <IFTAQuarterSelector currentQuarter={quarter} currentYear={year} />
      </div>

      {/* Report table with summary cards and CSV download */}
      <IFTAReportTable
        rows={reportData.rows}
        totals={reportData.totals}
        quarter={quarter}
        year={year}
        csvContent={csvContent}
      />
    </div>
  );
}
